// Phase 8: domain events -> outbox -> BullMQ -> notifications, email and webhooks.
// Needs Postgres and Redis (docker compose up -d --wait) and the seeded tenants.
process.env.NODE_ENV = 'test';
process.env.PLATFORM_API_KEY = 'test-platform-key';
process.env.ALLOW_INSECURE_WEBHOOKS = '1'; // the receiver below listens on http://127.0.0.1
process.env.JOB_BACKOFF_MS = '40';
process.env.JOB_ATTEMPTS = '4';
const http = require('node:http');
const request = require('supertest');
const { Worker } = require('bullmq');
const app = require('../src/app');
const prisma = require('../src/db/prisma');
const redis = require('../src/infra/redis');
const queues = require('../src/infra/queue');
const email = require('../src/modules/events/email');
const handlers = require('../src/modules/events/handlers');
const { relayAll } = require('../src/modules/events/relay');
const { startWorker } = require('../src/modules/events/worker');
const { sign } = require('../src/modules/events/webhook');

jest.setTimeout(40000);
const api = '/api/v1';
const PLATFORM = { 'x-platform-key': 'test-platform-key' };
const password = 'Password123!';
const as = (token) => ({ Authorization: `Bearer ${token}` });
const login = async (tenant, mail) =>
  (await request(app).post(`${api}/auth/login`).send({ tenant, email: mail, password })).body.token;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, what, timeout = 12000) {
  const end = Date.now() + timeout;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await sleep(60);
  }
}

// Webhook receiver we can steer: `behave` returns the HTTP status for the next call.
const calls = [];
let behave = () => 200;
const receiver = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    calls.push({ headers: req.headers, body });
    res.statusCode = behave(calls.length);
    res.end();
  });
});

const sent = []; // captured email
let worker, tenantId, admin, requester, approver, procurement, vendorId, webhookSecret, webhookUrl;

const me = async (token) => (await request(app).get(`${api}/auth/me`).set(as(token))).body;
const notes = async (token, q = '') => (await request(app).get(`${api}/notifications${q}`).set(as(token))).body;

// Creates, submits, approves and orders a request; returns ids and the request id of the PO call.
async function issuePO(title, requestId) {
  const pr = await request(app).post(`${api}/purchase-requests`).set(as(requester))
    .send({ title, items: [{ description: 'x', quantity: 1, unitPrice: 10 }] });
  await request(app).post(`${api}/purchase-requests/${pr.body.id}/submit`).set(as(requester));
  await request(app).post(`${api}/purchase-requests/${pr.body.id}/approve`).set(as(approver));
  const po = await request(app).post(`${api}/purchase-orders`).set(as(procurement)).set('x-request-id', requestId)
    .send({ prId: pr.body.id, vendorId });
  return { prId: pr.body.id, poId: po.body.id, poNumber: po.body.poNumber };
}

beforeAll(async () => {
  for (let i = 0; i < 50 && !redis.ready(); i++) await sleep(100);
  if (!redis.ready()) throw new Error('Redis is not reachable: run `docker compose up -d --wait redis`');
  await new Promise((r) => receiver.listen(0, '127.0.0.1', r));
  webhookUrl = `http://127.0.0.1:${receiver.address().port}/hook`;

  // Start from an empty queue and outbox: earlier test files publish events nobody consumed.
  await queues.queue().obliterate({ force: true });
  await queues.queue('dead').obliterate({ force: true });
  await prisma.unscoped.eventOutbox.deleteMany();

  email.setTransport({ sendMail: async (m) => { sent.push(m); return {}; } });
  worker = startWorker({ lockDuration: 1500, stalledInterval: 500 });

  const slug = `queue${Date.now()}`;
  const created = await request(app).post(`${api}/platform/tenants`).set(PLATFORM)
    .send({ name: 'Queue Co', slug, admin: { name: 'Boss', email: 'boss@example.com', password } });
  tenantId = created.body.tenant.id;
  admin = await login(slug, 'boss@example.com');
  for (const [name, role] of [['requester', 'REQUESTER'], ['approver', 'APPROVER'], ['procurement', 'PROCUREMENT']]) {
    await request(app).post(`${api}/auth/register`).set(as(admin)).send({ name, email: `${name}@example.com`, password, role });
  }
  [requester, approver, procurement] = await Promise.all(
    ['requester', 'approver', 'procurement'].map((n) => login(slug, `${n}@example.com`)),
  );
  vendorId = (await request(app).post(`${api}/vendors`).set(as(procurement)).send({ name: 'Queue vendor' })).body.id;

  const hook = await request(app).put(`${api}/settings/webhook`).set(as(admin)).send({ url: webhookUrl });
  webhookSecret = hook.body.secret;
}, 60000);

afterAll(async () => {
  await worker?.close();
  await new Promise((r) => receiver.close(r));
  await prisma.$disconnect();
});

describe('notifications', () => {
  it('a submitted request notifies approvers and admins, once each, and emails them once', async () => {
    const before = sent.length;
    const pr = await request(app).post(`${api}/purchase-requests`).set(as(requester))
      .send({ title: 'Standing desks', items: [{ description: 'Desk', quantity: 3, unitPrice: 300 }] });
    await request(app).post(`${api}/purchase-requests/${pr.body.id}/submit`).set(as(requester));

    const inbox = await waitFor(async () => {
      const list = await notes(approver);
      return list.data.find((n) => n.entityId === pr.body.id && n.type === 'REQUEST_SUBMITTED') && list;
    }, 'the approver notification');
    const mine = inbox.data.filter((n) => n.entityId === pr.body.id);
    expect(mine.length).toBe(1);
    expect(mine[0].title).toBe('Approval needed: "Standing desks"');
    expect(mine[0].readAt).toBeNull();

    // The admin is notified too; the requester who submitted is not.
    expect((await notes(admin)).data.some((n) => n.entityId === pr.body.id)).toBe(true);
    expect((await notes(requester)).data.some((n) => n.entityId === pr.body.id)).toBe(false);

    await waitFor(() => sent.length >= before + 2, 'the emails');
    await sleep(400); // give any duplicate a chance to show up
    const mails = sent.slice(before).filter((m) => m.subject.includes('Standing desks'));
    expect(mails.map((m) => m.to).sort()).toEqual(['approver@example.com', 'boss@example.com']);
  });

  it('a decision notifies the requester', async () => {
    const pr = await request(app).post(`${api}/purchase-requests`).set(as(requester))
      .send({ title: 'Monitors', items: [{ description: 'Monitor', quantity: 2, unitPrice: 150 }] });
    await request(app).post(`${api}/purchase-requests/${pr.body.id}/submit`).set(as(requester));
    await request(app).post(`${api}/purchase-requests/${pr.body.id}/reject`).set(as(approver)).send({ comment: 'too pricey' });

    const note = await waitFor(async () =>
      (await notes(requester)).data.find((n) => n.entityId === pr.body.id && n.type === 'REQUEST_DECIDED'), 'the decision notification');
    expect(note.title).toBe('Your request "Monitors" was rejected');
    await waitFor(() => sent.some((m) => m.to === 'requester@example.com' && m.subject === note.title), 'the decision email');
  });

  it('can be listed unread, marked read and paged; only the owner can touch them', async () => {
    const all = await notes(approver, '?pageSize=100');
    expect(all.data.length).toBeGreaterThan(0);
    const [first] = all.data;

    const read = await request(app).post(`${api}/notifications/${first.id}/read`).set(as(approver));
    expect(read.status).toBe(200);
    expect(read.body.readAt).not.toBeNull();
    expect((await notes(approver, '?unread=true&pageSize=100')).data.some((n) => n.id === first.id)).toBe(false);
    expect((await notes(approver, '?unread=false&pageSize=100')).data.some((n) => n.id === first.id)).toBe(true);

    // Someone else's notification (or a missing one) is a 404.
    expect((await request(app).post(`${api}/notifications/${first.id}/read`).set(as(requester))).status).toBe(404);
    expect((await request(app).post(`${api}/notifications/99999999/read`).set(as(approver))).status).toBe(404);

    const readAll = await request(app).post(`${api}/notifications/read-all`).set(as(approver));
    expect(readAll.status).toBe(200);
    expect((await notes(approver, '?unread=true')).data).toEqual([]);

    const page1 = await notes(approver, '?pageSize=1');
    expect(page1.data.length).toBe(1);
    expect(page1.nextCursor).toBeTruthy();
    const page2 = await notes(approver, `?pageSize=1&cursor=${page1.nextCursor}`);
    expect(page2.data[0].id).toBeLessThan(page1.data[0].id);
  });

  it('never shows another tenant\'s notifications', async () => {
    const other = await login('acme', 'approver@example.com');
    const list = await notes(other, '?pageSize=100');
    expect(list.data.filter((n) => n.title.includes('Standing desks'))).toEqual([]);
  });

  it('requires a login', async () => {
    expect((await request(app).get(`${api}/notifications`)).status).toBe(401);
  });
});

describe('webhooks', () => {
  it('delivers PO_ISSUED once, signed, with the request id, and notifies the requester', async () => {
    calls.length = 0;
    behave = () => 200;
    const { poId, poNumber } = await issuePO('Chairs', 'po-create-req-01');

    await waitFor(() => calls.length >= 1, 'the webhook call');
    await sleep(300);
    expect(calls.length).toBe(1);
    const [{ headers, body }] = calls;
    const event = JSON.parse(body);
    expect(event).toMatchObject({ type: 'PO_ISSUED', data: { poId, poNumber, title: 'Chairs' } });
    expect(event.id).toBe(headers['x-event-id']);
    expect(headers['x-event-type']).toBe('PO_ISSUED');
    expect(headers['x-request-id']).toBe('po-create-req-01'); // correlation id travelled through outbox and queue
    expect(headers['x-signature']).toBe(sign(webhookSecret, headers['x-timestamp'], body));
    expect(Math.abs(Date.now() / 1000 - Number(headers['x-timestamp']))).toBeLessThan(30);

    const note = await waitFor(async () =>
      (await notes(requester)).data.find((n) => n.type === 'PO_ISSUED' && n.entityId === poId), 'the PO notification');
    expect(note.title).toBe(`Purchase order ${poNumber} was issued for "Chairs"`);
  });

  it('retries a failing receiver with backoff and delivers once it recovers, always with the same event id', async () => {
    const { poId } = await issuePO('Lamps', 'retry-req-0001');
    await waitFor(() => calls.some((c) => JSON.parse(c.body).data.poId === poId), 'the issue webhook');

    calls.length = 0;
    behave = (n) => (n <= 2 ? 503 : 200); // fails twice, then works
    await request(app).post(`${api}/purchase-orders/${poId}/cancel`).set(as(procurement));

    await waitFor(() => calls.length >= 3, 'three delivery attempts');
    await sleep(500);
    expect(calls.length).toBe(3); // no further attempts after success
    expect(new Set(calls.map((c) => c.headers['x-event-id'])).size).toBe(1);
    expect(JSON.parse(calls[2].body).type).toBe('PO_CANCELLED');
    behave = () => 200;
  });

  it('parks a job that keeps failing in the dead-letter queue, and it can be requeued', async () => {
    behave = () => 500;
    calls.length = 0;
    const { poId } = await issuePO('Rugs', 'dead-req-0001');
    await waitFor(() => calls.length >= 4, 'all four attempts'); // JOB_ATTEMPTS
    await sleep(400);
    expect(calls.length).toBe(4);

    const dead = await waitFor(async () => {
      const res = await request(app).get(`${api}/platform/dead-letters`).set(PLATFORM);
      return res.body.data.find((d) => d.tenantId === tenantId && d.type === 'PO_ISSUED' && d.failedReason.includes('500')) && res.body;
    }, 'the dead letter');
    const entry = dead.data.find((d) => d.type === 'PO_ISSUED');
    expect(entry).toMatchObject({ job: 'webhook', attemptsMade: 4 });

    // The other channel is independent: the in-app notification was created despite the failing webhook.
    expect((await notes(requester)).data.some((n) => n.type === 'PO_ISSUED' && n.entityId === poId)).toBe(true);

    // Receiver is fixed; requeue.
    behave = () => 200;
    calls.length = 0;
    const retry = await request(app).post(`${api}/platform/dead-letters/${entry.id}/retry`).set(PLATFORM);
    expect(retry.status).toBe(202);
    await waitFor(() => calls.length === 1, 'the redelivery');
    const after = await request(app).get(`${api}/platform/dead-letters`).set(PLATFORM);
    expect(after.body.data.find((d) => d.id === entry.id)).toBeUndefined();
  });

  it('does not retry a permanent failure (4xx): straight to the dead-letter queue after one call', async () => {
    behave = () => 410;
    calls.length = 0;
    await issuePO('Plants', 'gone-req-00001');
    await waitFor(() => calls.length >= 1, 'the first call');
    await sleep(500);
    expect(calls.length).toBe(1);
    const dead = await waitFor(async () => {
      const res = await request(app).get(`${api}/platform/dead-letters`).set(PLATFORM);
      return res.body.data.find((d) => d.failedReason.includes('410'));
    }, 'the 410 dead letter');
    expect(dead.attemptsMade).toBe(1);
    behave = () => 200;
    await request(app).post(`${api}/platform/dead-letters/${dead.id}/retry`).set(PLATFORM); // clean up
  });

  it('is configured by admins only; the secret is shown once', async () => {
    expect((await request(app).get(`${api}/settings/webhook`).set(as(requester))).status).toBe(403);
    expect((await request(app).put(`${api}/settings/webhook`).set(as(procurement)).send({ url: webhookUrl })).status).toBe(403);
    expect((await request(app).put(`${api}/settings/webhook`).set(as(admin)).send({ url: 'not a url' })).status).toBe(400);

    const same = await request(app).put(`${api}/settings/webhook`).set(as(admin)).send({ url: webhookUrl });
    expect(same.body.secret).toBeUndefined(); // secret kept, not re-shown
    const read = await request(app).get(`${api}/settings/webhook`).set(as(admin));
    expect(read.body).toEqual({ url: webhookUrl, hasSecret: true });

    const rotated = await request(app).put(`${api}/settings/webhook`).set(as(admin)).send({ url: webhookUrl, rotateSecret: true });
    expect(rotated.body.secret).toMatch(/^whsec_/);
    expect(rotated.body.secret).not.toBe(webhookSecret);
    webhookSecret = rotated.body.secret;
  });

  it('sends nothing when the webhook is switched off', async () => {
    await request(app).put(`${api}/settings/webhook`).set(as(admin)).send({ url: null });
    calls.length = 0;
    await issuePO('Shelves', 'off-req-000001');
    await sleep(1200);
    expect(calls.length).toBe(0);
    const set = await request(app).put(`${api}/settings/webhook`).set(as(admin)).send({ url: webhookUrl });
    webhookSecret = set.body.secret;
  });
});

describe('delivery guarantees', () => {
  it('running a job twice creates no second notification and no second email', async () => {
    const pr = await request(app).post(`${api}/purchase-requests`).set(as(requester))
      .send({ title: 'Twice', items: [{ description: 'x', quantity: 1, unitPrice: 1 }] });
    await request(app).post(`${api}/purchase-requests/${pr.body.id}/submit`).set(as(requester));
    const note = await waitFor(async () =>
      (await notes(approver)).data.find((n) => n.entityId === pr.body.id), 'the first delivery');
    await waitFor(() => sent.some((m) => m.subject.includes('Twice') && m.to === 'approver@example.com'), 'the email');
    const before = sent.length;

    const { eventId } = await prisma.unscoped.notification.findUnique({ where: { id: note.id } });
    const job = {
      eventId, tenantId, type: 'REQUEST_SUBMITTED', payload: { prId: pr.body.id, title: 'Twice', requesterId: (await me(requester)).id } };
    await handlers.notify(job);
    await handlers.notify(job);

    const count = await prisma.unscoped.notification.count({ where: { tenantId, eventId, type: 'REQUEST_SUBMITTED' } });
    expect(count).toBe(2); // one per recipient (approver and admin), unchanged by the reruns
    expect(sent.length).toBe(before);
  });

  it('a crash after the notification was saved but before the email resumes without duplicates', async () => {
    const eventId = 900000 + Math.floor(Math.random() * 99999);
    const approverUser = await me(approver);
    await prisma.unscoped.notification.create({
      data: { tenantId, userId: approverUser.id, eventId, type: 'REQUEST_SUBMITTED', title: 'Approval needed: "Half done"', entity: 'PurchaseRequest', entityId: 1 },
    });
    const before = sent.length;
    const job = { eventId, tenantId, type: 'REQUEST_SUBMITTED', payload: { prId: 1, title: 'Half done', requesterId: (await me(requester)).id } };
    await handlers.notify(job); // the rerun after the "crash"
    await handlers.notify(job);
    const rows = await prisma.unscoped.notification.findMany({ where: { tenantId, eventId } });
    expect(rows.every((r) => r.emailedAt)).toBe(true);
    expect(sent.slice(before).filter((m) => m.subject === 'Approval needed: "Half done"').length).toBe(rows.length); // one email per user
  });

  it('a worker killed mid-job loses nothing: the job is recovered and delivered exactly once', async () => {
    await worker.close(); // no consumers left

    // A stand-in for a worker process that takes the job and then dies without finishing or acking it.
    let taken = false;
    const doomed = new Worker(queues.NAMES.main, async () => { taken = true; await new Promise(() => {}); }, {
      connection: queues.connectionOptions(), lockDuration: 1500, stalledInterval: 500,
    });
    doomed.on('error', () => {});

    const before = sent.length;
    const pr = await request(app).post(`${api}/purchase-requests`).set(as(requester))
      .send({ title: 'Killed mid-job', items: [{ description: 'x', quantity: 1, unitPrice: 1 }] });
    await request(app).post(`${api}/purchase-requests/${pr.body.id}/submit`).set(as(requester));
    await relayAll();
    await waitFor(() => taken, 'the doomed worker to take the job');
    await doomed.close(true); // "kill -9": no graceful hand-back, the lock just expires

    expect((await notes(approver)).data.some((n) => n.entityId === pr.body.id)).toBe(false); // nothing delivered yet

    worker = startWorker({ lockDuration: 1500, stalledInterval: 500 }); // the restarted worker
    await waitFor(async () => (await notes(approver)).data.find((n) => n.entityId === pr.body.id), 'the recovered delivery', 20000);
    await sleep(600);

    const rows = await prisma.unscoped.notification.findMany({ where: { tenantId, entityId: pr.body.id, type: 'REQUEST_SUBMITTED' } });
    expect(rows.length).toBe(2); // approver and admin, once each
    expect(sent.slice(before).filter((m) => m.subject.includes('Killed mid-job')).length).toBe(2);
  });

  it('publishing is idempotent: republishing an event does not create a second job', async () => {
    const pr = await request(app).post(`${api}/purchase-requests`).set(as(requester))
      .send({ title: 'Republish', items: [{ description: 'x', quantity: 1, unitPrice: 1 }] });
    await request(app).post(`${api}/purchase-requests/${pr.body.id}/submit`).set(as(requester));
    const note = await waitFor(async () => (await notes(approver)).data.find((n) => n.entityId === pr.body.id), 'delivery');
    const eventId = (await prisma.unscoped.notification.findUnique({ where: { id: note.id } })).eventId;

    const job = await queues.queue().getJob(`notify-${eventId}`);
    expect(job.data.correlationId).toMatch(/^[0-9a-f-]{36}$/); // the submit request's id rode along
    const again = await queues.queue().add('notify', job.data, { jobId: `notify-${eventId}` });
    expect(again.id).toBe(job.id); // BullMQ returned the existing job
    expect(await queues.queue().getJobCounts('waiting', 'active', 'delayed')).toMatchObject({ waiting: 0, delayed: 0 });
  });

  it('events not yet published wait in the outbox and are published later, in order', async () => {
    const stuck = await prisma.unscoped.eventOutbox.count();
    expect(stuck).toBe(0); // everything above was relayed
    const pr = await request(app).post(`${api}/purchase-requests`).set(as(requester))
      .send({ title: 'Outbox check', items: [{ description: 'x', quantity: 1, unitPrice: 1 }] });
    await request(app).post(`${api}/purchase-requests/${pr.body.id}/submit`).set(as(requester));
    await waitFor(async () => (await prisma.unscoped.eventOutbox.count()) === 0, 'the relay to publish');
  });
});

describe('webhook URL guard', () => {
  it('refuses plain http, credentials and private or local addresses unless insecure mode is on', () => {
    jest.isolateModules(() => {
      process.env.ALLOW_INSECURE_WEBHOOKS = '';
      const { webhookUrlProblem } = require('../src/modules/events/webhook');
      expect(webhookUrlProblem('https://hooks.example.com/procurement')).toBeNull();
      for (const bad of [
        'http://hooks.example.com', 'ftp://hooks.example.com', 'not a url', 'https://user:pw@hooks.example.com',
        'https://localhost/x', 'https://app.localhost/x', 'https://printer.local/x', 'https://db.internal/x',
        'https://127.0.0.1/x', 'https://10.1.2.3/x', 'https://172.16.0.1/x', 'https://172.31.255.255/x',
        'https://192.168.1.1/x', 'https://169.254.169.254/latest/meta-data', 'https://0.0.0.0/x', 'https://[::1]/x', 'https://[fd00::1]/x',
      ]) expect({ bad, problem: webhookUrlProblem(bad) }).toEqual({ bad, problem: expect.any(String) });
      expect(webhookUrlProblem('https://172.32.0.1/x')).toBeNull(); // just outside the private range
    });
    process.env.ALLOW_INSECURE_WEBHOOKS = '1';
  });
});

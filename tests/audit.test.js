// Phase 7: audit trail in MongoDB, fed through the Postgres outbox.
// Needs Postgres, Redis and MongoDB (docker compose up -d --wait) and the seeded tenants.
process.env.NODE_ENV = 'test';
process.env.PLATFORM_API_KEY = 'test-platform-key';
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/db/prisma');
const mongo = require('../src/infra/mongo');
const AuditEvent = require('../src/modules/audit/audit.model');
const { drain, drainAll } = require('../src/modules/audit/drain');
const { auditRetentionDays } = require('../src/config/env');

const api = '/api/v1';
const password = 'Password123!';
const as = (token) => ({ Authorization: `Bearer ${token}` });
const login = async (tenant, email) =>
  (await request(app).post(`${api}/auth/login`).send({ tenant, email, password })).body.token;
jest.setTimeout(30000); // setup drains the backlog and hashes several passwords
const audit = (token, query = '') => request(app).get(`${api}/audit${query}`).set(as(token));

let admin, requester, approver, procurement, tenantId, ids, slug;

beforeAll(async () => {
  for (let i = 0; i < 100 && !mongo.ready(); i++) await new Promise((r) => setTimeout(r, 100));
  if (!mongo.ready()) throw new Error('MongoDB is not reachable: run `docker compose up -d --wait mongo`');
  await AuditEvent.ensureReady();
  await drainAll(); // clears the backlog (including the backfilled pre-phase-7 events)

  slug = `audit${Date.now()}`;
  const created = await request(app).post(`${api}/platform/tenants`).set({ 'x-platform-key': 'test-platform-key' })
    .send({ name: 'Audit Co', slug, admin: { name: 'Boss', email: 'boss@example.com', password } });
  tenantId = created.body.tenant.id;
  admin = await login(slug, 'boss@example.com');
  for (const [name, role] of [['requester', 'REQUESTER'], ['approver', 'APPROVER'], ['procurement', 'PROCUREMENT']]) {
    await request(app).post(`${api}/auth/register`).set(as(admin)).send({ name, email: `${name}@example.com`, password, role });
  }
  [requester, approver, procurement] = await Promise.all(
    ['requester', 'approver', 'procurement'].map((n) => login(slug, `${n}@example.com`)),
  );

  // One full lifecycle: request -> edit -> submit -> approve -> vendor -> order -> cancel.
  const pr = await request(app).post(`${api}/purchase-requests`).set(as(requester))
    .send({ title: 'Laptops', items: [{ description: 'Laptop', quantity: 2, unitPrice: 1000 }] });
  await request(app).patch(`${api}/purchase-requests/${pr.body.id}`).set(as(requester)).send({ title: 'Laptops (14 inch)' });
  await request(app).post(`${api}/purchase-requests/${pr.body.id}/submit`).set(as(requester));
  await request(app).post(`${api}/purchase-requests/${pr.body.id}/approve`).set(as(approver))
    .set('x-request-id', 'approve-req-0001').send({ comment: 'ok' });
  const vendor = await request(app).post(`${api}/vendors`).set(as(procurement)).send({ name: 'Acme Supplies' });
  await request(app).patch(`${api}/vendors/${vendor.body.id}`).set(as(procurement)).send({ name: 'Acme Supplies Ltd' });
  const po = await request(app).post(`${api}/purchase-orders`).set(as(procurement)).send({ prId: pr.body.id, vendorId: vendor.body.id });
  await request(app).post(`${api}/purchase-orders/${po.body.id}/cancel`).set(as(procurement));
  ids = { pr: pr.body.id, vendor: vendor.body.id, po: po.body.id };
}, 60000);
afterAll(() => prisma.$disconnect());

describe('what gets recorded', () => {
  it('a request lifecycle produces one event per state change, newest first, with the actor', async () => {
    const res = await audit(admin, `?entity=PurchaseRequest&entityId=${ids.pr}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((e) => e.action)).toEqual(['APPROVED', 'SUBMIT', 'UPDATE', 'CREATE']);
    const requesterId = (await request(app).get(`${api}/auth/me`).set(as(requester))).body.id;
    const approverId = (await request(app).get(`${api}/auth/me`).set(as(approver))).body.id;
    expect(res.body.data.map((e) => e.actorId)).toEqual([approverId, requesterId, requesterId, requesterId]);
  });

  it('keeps before/after snapshots', async () => {
    const events = (await audit(admin, `?entity=PurchaseRequest&entityId=${ids.pr}`)).body.data;
    const [approved, , update, create] = events;
    expect(approved.before).toEqual({ status: 'SUBMITTED' });
    expect(approved.after).toEqual({ status: 'APPROVED', comment: 'ok' });
    expect(update.before.title).toBe('Laptops');
    expect(update.after.title).toBe('Laptops (14 inch)');
    expect(create.before).toBeNull();
    expect(create.after).toMatchObject({ title: 'Laptops', status: 'DRAFT', itemCount: 1 });

    const vendor = (await audit(admin, `?entity=Vendor&entityId=${ids.vendor}`)).body.data;
    expect(vendor.map((e) => e.action)).toEqual(['UPDATE', 'CREATE']);
    expect(vendor[0].before.name).toBe('Acme Supplies');
    expect(vendor[0].after.name).toBe('Acme Supplies Ltd');
  });

  it('records purchase orders, users and the tenant itself', async () => {
    const po = (await audit(admin, `?entity=PurchaseOrder&entityId=${ids.po}`)).body.data;
    expect(po.map((e) => e.action)).toEqual(['CANCEL', 'CREATE']);
    expect(po[1].after).toMatchObject({ prId: ids.pr, vendorId: ids.vendor, status: 'ISSUED' });
    expect(po[1].after.poNumber).toMatch(/^PO-\d{4}-\d{4}$/);

    const users = (await audit(admin, '?entity=User&pageSize=100')).body.data;
    expect(users.length).toBe(4); // the first admin plus three registered users
    expect(JSON.stringify(users)).not.toMatch(/passwordHash|Password123/); // secrets never reach the trail

    const tenant = (await audit(admin, `?entity=Tenant&entityId=${tenantId}`)).body.data;
    expect(tenant.map((e) => e.action)).toEqual(['CREATE']);
    expect(tenant[0].actorId).toBeNull(); // platform-owner action
  });

  it('ties events to the request that caused them (X-Request-Id)', async () => {
    const approved = (await audit(admin, `?entity=PurchaseRequest&entityId=${ids.pr}&action=APPROVED`)).body.data[0];
    expect(approved.correlationId).toBe('approve-req-0001');

    const generated = await request(app).get('/health').set('x-request-id', 'bad id!');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const echoed = await request(app).get('/health').set('x-request-id', 'caller-supplied-1');
    expect(echoed.headers['x-request-id']).toBe('caller-supplied-1');
  });

  it('a failed business action leaves no event behind (events commit with the change)', async () => {
    const before = (await audit(admin, `?entity=PurchaseRequest&entityId=${ids.pr}`)).body.data.length;
    const again = await request(app).post(`${api}/purchase-requests/${ids.pr}/approve`).set(as(approver));
    expect(again.status).toBe(409);
    const after = (await audit(admin, `?entity=PurchaseRequest&entityId=${ids.pr}`)).body.data.length;
    expect(after).toBe(before);
  });
});

describe('querying', () => {
  it('filters by actor, action and time window', async () => {
    const approverId = (await request(app).get(`${api}/auth/me`).set(as(approver))).body.id;
    const byActor = (await audit(admin, `?actorId=${approverId}&pageSize=100`)).body.data;
    expect(byActor.length).toBe(1);
    expect(byActor[0].action).toBe('APPROVED');

    const future = new Date(Date.now() + 3600e3).toISOString();
    expect((await audit(admin, `?from=${encodeURIComponent(future)}`)).body.data).toEqual([]);
    const all = (await audit(admin, `?to=${encodeURIComponent(future)}&pageSize=100`)).body.data;
    expect(all.length).toBeGreaterThan(10);
  });

  it('walks the whole trail with cursors, without gaps or repeats', async () => {
    const everything = (await audit(admin, '?pageSize=100')).body.data.map((e) => e.id);
    const walked = [];
    let cursor;
    for (let i = 0; i < 40; i++) {
      const res = await audit(admin, `?pageSize=3${cursor ? `&cursor=${cursor}` : ''}`);
      walked.push(...res.body.data.map((e) => e.id));
      if (!res.body.nextCursor) break;
      cursor = res.body.nextCursor;
    }
    expect(walked).toEqual(everything);
    expect(new Set(walked).size).toBe(walked.length);
  });

  it('rejects malformed input with a 400', async () => {
    expect((await audit(admin, '?cursor=garbage')).status).toBe(400);
    expect((await audit(admin, '?from=yesterday')).status).toBe(400);
    expect((await audit(admin, '?pageSize=0')).status).toBe(400);
  });
});

describe('access', () => {
  it('is admin-only', async () => {
    for (const token of [requester, approver, procurement]) expect((await audit(token)).status).toBe(403);
    expect((await request(app).get(`${api}/audit`)).status).toBe(401);
  });

  it('never shows another tenant\'s events', async () => {
    const otherAdmin = await login('globex', 'admin@example.com');
    for (const q of [`?entity=PurchaseRequest&entityId=${ids.pr}`, `?entity=Vendor&entityId=${ids.vendor}`, `?entity=Tenant`]) {
      const res = await audit(otherAdmin, q);
      expect(res.status).toBe(200);
      expect(res.body.data.filter((e) => e.entityId === ids.pr && e.entity === 'PurchaseRequest')).toEqual([]);
      expect(res.body.data.filter((e) => e.entityId === tenantId && e.entity === 'Tenant')).toEqual([]);
    }
  });
});

describe('outbox and MongoDB', () => {
  const outbox = () => prisma.unscoped.auditOutbox.count({ where: { tenantId } });

  it('a MongoDB failure never fails the business request; the event waits and is delivered later, once', async () => {
    await drainAll();
    const spy = jest.spyOn(AuditEvent, 'insertMany').mockRejectedValueOnce(new Error('mongo went away'));
    const created = await request(app).post(`${api}/vendors`).set(as(procurement)).send({ name: 'Made during outage' });
    expect(created.status).toBe(201); // the business transaction is unaffected

    expect(await drain({ tenantId })).toBe(0); // Mongo rejects the batch
    const stuck = await prisma.unscoped.auditOutbox.findMany({ where: { tenantId } });
    expect(stuck.length).toBe(1);
    expect(stuck[0]).toMatchObject({ attempts: 1, lastError: 'mongo went away', entityId: created.body.id });
    spy.mockRestore();

    expect(await drain({ tenantId })).toBe(1); // Mongo is back
    expect(await outbox()).toBe(0);
    expect(await AuditEvent.countDocuments({ tenantId, entity: 'Vendor', entityId: created.body.id })).toBe(1);
  });

  it('draining is idempotent: concurrent drains never duplicate an event', async () => {
    await drainAll();
    const made = [];
    for (let i = 0; i < 3; i++) {
      made.push((await request(app).post(`${api}/vendors`).set(as(procurement)).send({ name: `Concurrent ${i}` })).body.id);
    }
    await Promise.all([drain(), drain(), drain(), drain({ tenantId })]);
    await drainAll();
    for (const id of made) expect(await AuditEvent.countDocuments({ tenantId, entity: 'Vendor', entityId: id })).toBe(1);
    expect(await outbox()).toBe(0);
  });

  it('a stored event survives being re-sent (unique outboxId)', async () => {
    const event = await AuditEvent.findOne({ tenantId }).lean();
    await expect(AuditEvent.create({ ...event, _id: undefined })).rejects.toThrow(/duplicate key/);
  });

  it('old outbox rows (the pre-Mongo audit history) are backfilled with their original time', async () => {
    const old = await prisma.unscoped.auditOutbox.create({
      data: { tenantId, actorId: null, action: 'LEGACY', entity: 'Vendor', entityId: 999999, at: new Date('2025-01-15T10:00:00Z') },
    });
    await drainAll();
    const stored = await AuditEvent.findOne({ outboxId: old.id }).lean();
    expect(stored.action).toBe('LEGACY');
    expect(stored.at.toISOString()).toBe('2025-01-15T10:00:00.000Z');
  });

  it('events expire after the retention period (TTL index, expireAt = at + retention)', async () => {
    const indexes = await AuditEvent.collection.indexes();
    const ttl = indexes.find((i) => i.key.expireAt === 1);
    expect(ttl.expireAfterSeconds).toBe(0);
    const event = await AuditEvent.findOne({ tenantId }).lean();
    const days = Math.round((event.expireAt - event.at) / 86400e3);
    expect(days).toBe(auditRetentionDays);
  });

  it('the audit API fails closed without a tenant context', async () => {
    await expect(require('../src/modules/audit/audit.service').list({ pageSize: 5 })).rejects.toThrow(/No tenant context/);
  });
});

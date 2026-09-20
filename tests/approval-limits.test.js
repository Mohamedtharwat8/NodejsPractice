// BR9: above the tenant threshold an approver needs a limit that covers the request total.
process.env.NODE_ENV = 'test';
process.env.LOGIN_RATE_LIMIT = '100000';
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/db/prisma');
const { drainAll } = require('../src/modules/audit/drain');

const api = '/api/v1';
const as = (token) => ({ Authorization: `Bearer ${token}` });
const login = async (email, tenant = 'acme') =>
  (await request(app).post(`${api}/auth/login`).send({ tenant, email, password: 'Password123!' })).body.token;

let admin, requester, seededApprover;
const setThreshold = (threshold) => request(app).put(`${api}/settings/approval`).set(as(admin)).send({ threshold });

// A submitted request worth `amount`.
async function submitted(amount) {
  const pr = await request(app).post(`${api}/purchase-requests`).set(as(requester))
    .send({ title: `Limit ${amount}`, items: [{ description: 'Item', quantity: 1, unitPrice: amount }] });
  await request(app).post(`${api}/purchase-requests/${pr.body.id}/submit`).set(as(requester));
  return pr.body.id;
}
const decide = (token, id, action) => request(app).post(`${api}/purchase-requests/${id}/${action}`).set(as(token)).send({});

// A new approver with the given limit (null = no limit above the threshold).
async function approverWith(approvalLimit) {
  const email = `approver-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const created = await request(app).post(`${api}/auth/register`).set(as(admin))
    .send({ name: 'Limited approver', email, password: 'Password123!', role: 'APPROVER', approvalLimit });
  expect(created.status).toBe(201);
  return login(email);
}

beforeAll(async () => {
  [admin, requester, seededApprover] = await Promise.all(
    ['admin@example.com', 'requester@example.com', 'approver@example.com'].map((e) => login(e)));
});
afterAll(async () => {
  await setThreshold(null); // the seeded tenant is shared with the other suites
  await prisma.$disconnect();
});

describe('BR9 approval limits', () => {
  afterEach(() => setThreshold(null));

  it('changes nothing while no threshold is set', async () => {
    expect((await request(app).get(`${api}/settings/approval`).set(as(admin))).body).toEqual({ threshold: null });
    expect((await decide(seededApprover, await submitted(50000), 'approve')).status).toBe(200);
  });

  it('lets any approver approve up to the threshold', async () => {
    await setThreshold(1000);
    expect((await decide(seededApprover, await submitted(1000), 'approve')).status).toBe(200); // equal is not above
  });

  it('blocks an approver without a limit above the threshold and leaves the request undecided', async () => {
    await setThreshold(1000);
    const id = await submitted(1500);
    const res = await decide(seededApprover, id, 'approve');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('APPROVAL_LIMIT_EXCEEDED');
    const after = await request(app).get(`${api}/purchase-requests/${id}`).set(as(admin));
    expect(after.body.status).toBe('SUBMITTED');
  });

  it('blocks an approver whose limit is below the total, and allows one whose limit covers it', async () => {
    await setThreshold(1000);
    const [low, high] = await Promise.all([approverWith(1500), approverWith(5000)]);
    const id = await submitted(2000);
    expect((await decide(low, id, 'approve')).status).toBe(403);
    expect((await decide(high, id, 'approve')).status).toBe(200);
  });

  it('never limits rejecting, and exempts admins', async () => {
    await setThreshold(1000);
    expect((await decide(seededApprover, await submitted(9000), 'reject')).status).toBe(200);
    expect((await decide(admin, await submitted(9000), 'approve')).status).toBe(200);
  });

  it('can be raised per user by an admin, taking effect immediately', async () => {
    await setThreshold(1000);
    const email = `raised-${Date.now()}@example.com`;
    const user = await request(app).post(`${api}/auth/register`).set(as(admin))
      .send({ name: 'Raised', email, password: 'Password123!', role: 'APPROVER' });
    const token = await login(email);
    const id = await submitted(3000);
    expect((await decide(token, id, 'approve')).status).toBe(403);
    const set = await request(app).put(`${api}/settings/approval/users/${user.body.id}`).set(as(admin)).send({ approvalLimit: 4000 });
    expect(set.body).toEqual({ id: user.body.id, approvalLimit: 4000 });
    expect((await decide(token, id, 'approve')).status).toBe(200);
  });

  it('validates input and stays inside the tenant', async () => {
    expect((await request(app).put(`${api}/settings/approval`).set(as(admin)).send({ threshold: -5 })).status).toBe(400);
    expect((await request(app).put(`${api}/settings/approval`).set(as(admin)).send({})).status).toBe(400);
    expect((await request(app).put(`${api}/settings/approval/users/999999999`).set(as(admin)).send({ approvalLimit: 1 })).status).toBe(404);
    const globex = await login('admin@example.com', 'globex');
    const other = await request(app).get(`${api}/settings/approval`).set(as(globex));
    expect(other.body).toEqual({ threshold: null }); // acme's threshold does not leak
  });

  it('is audited', async () => {
    const res = await setThreshold(2500);
    expect(res.body).toEqual({ threshold: 2500 });
    await drainAll(); // audit events reach MongoDB through the outbox
    const events = (await request(app).get(`${api}/audit?entity=Tenant&action=SET_APPROVAL_THRESHOLD`).set(as(admin))).body.data;
    expect(events[0].after).toEqual({ threshold: 2500 });
  });
});

// Integration tests: need a migrated + seeded Postgres (see README) via DATABASE_URL in .env.
process.env.NODE_ENV = 'test';
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/db/prisma');

const login = async (email, tenant = 'acme') =>
  (await request(app).post('/auth/login').send({ tenant, email, password: 'Password123!' })).body.token;
const as = (token) => ({ Authorization: `Bearer ${token}` });

afterAll(() => prisma.$disconnect());

describe('auth guards (no DB needed)', () => {
  it('rejects requests without a token', async () => {
    expect((await request(app).get('/vendors')).status).toBe(401);
  });
  it('serves /health', async () => {
    expect((await request(app).get('/health')).status).toBe(200);
  });
});

describe('purchase flow', () => {
  let requester, approver, procurement, vendorId, prId;

  beforeAll(async () => {
    [requester, approver, procurement] = await Promise.all([
      login('requester@example.com'),
      login('approver@example.com'),
      login('procurement@example.com'),
    ]);
    const vendor = await request(app)
      .post('/vendors').set(as(procurement)).send({ name: `Vendor ${Date.now()}` });
    vendorId = vendor.body.id;
  });

  it('requester cannot create vendors', async () => {
    const res = await request(app).post('/vendors').set(as(requester)).send({ name: 'x' });
    expect(res.status).toBe(403);
  });

  it('PR -> submit -> approve -> PO happy path', async () => {
    const created = await request(app).post('/purchase-requests').set(as(requester))
      .send({ title: 'Laptops', items: [{ description: 'Laptop', quantity: 2, unitPrice: 1000 }] });
    expect(created.status).toBe(201);
    prId = created.body.id;
    expect(Number(created.body.totalAmount)).toBe(2000);

    // Cannot create PO or approve before submit.
    expect((await request(app).post(`/purchase-requests/${prId}/approve`).set(as(approver))).status).toBe(409);
    expect((await request(app).post('/purchase-orders').set(as(procurement)).send({ prId, vendorId })).status).toBe(409);

    expect((await request(app).post(`/purchase-requests/${prId}/submit`).set(as(requester))).status).toBe(200);
    expect((await request(app).post(`/purchase-requests/${prId}/approve`).set(as(requester))).status).toBe(403);
    expect((await request(app).post(`/purchase-requests/${prId}/approve`).set(as(approver))).status).toBe(200);

    const po = await request(app).post('/purchase-orders').set(as(procurement)).send({ prId, vendorId });
    expect(po.status).toBe(201);
    expect(po.body.poNumber).toMatch(/^PO-\d{4}-\d{4}$/);

    // One PO per PR.
    expect((await request(app).post('/purchase-orders').set(as(procurement)).send({ prId, vendorId })).status).toBe(409);
  });
});

describe('business rules', () => {
  let requester, approver, procurement;
  const newPR = (token) =>
    request(app).post('/purchase-requests').set(as(token))
      .send({ title: 'Chairs', items: [{ description: 'Chair', quantity: 1, unitPrice: 50 }] });

  beforeAll(async () => {
    [requester, approver, procurement] = await Promise.all([
      login('requester@example.com'),
      login('approver@example.com'),
      login('procurement@example.com'),
    ]);
  });

  it('BR3: only DRAFT requests are editable', async () => {
    const { body } = await newPR(requester);
    await request(app).post(`/purchase-requests/${body.id}/submit`).set(as(requester));
    const res = await request(app).patch(`/purchase-requests/${body.id}`).set(as(requester)).send({ title: 'x' });
    expect(res.status).toBe(409);
  });

  it('BR5: a request gets exactly one decision', async () => {
    const { body } = await newPR(requester);
    await request(app).post(`/purchase-requests/${body.id}/submit`).set(as(requester));
    const first = await request(app).post(`/purchase-requests/${body.id}/reject`).set(as(approver)).send({ comment: 'no' });
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('REJECTED');
    expect((await request(app).post(`/purchase-requests/${body.id}/approve`).set(as(approver))).status).toBe(409);
  });

  it('BR6: no PO from a rejected request or to an inactive vendor', async () => {
    const vendor = await request(app).post('/vendors').set(as(procurement)).send({ name: `Old ${Date.now()}` });
    await request(app).delete(`/vendors/${vendor.body.id}`).set(as(procurement));

    const { body } = await newPR(requester);
    await request(app).post(`/purchase-requests/${body.id}/submit`).set(as(requester));
    await request(app).post(`/purchase-requests/${body.id}/approve`).set(as(approver));
    const res = await request(app).post('/purchase-orders').set(as(procurement))
      .send({ prId: body.id, vendorId: vendor.body.id });
    expect(res.status).toBe(409);
  });

  it('requesters cannot see other requesters\' requests', async () => {
    const admin = await login('admin@example.com');
    const { body } = await newPR(admin);
    expect((await request(app).get(`/purchase-requests/${body.id}`).set(as(requester))).status).toBe(404);
  });

  it('rejects invalid input with 400', async () => {
    const res = await request(app).post('/purchase-requests').set(as(requester)).send({ title: '', items: [] });
    expect(res.status).toBe(400);
  });
});

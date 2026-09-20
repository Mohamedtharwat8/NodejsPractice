// Redis is optional: with it unreachable every feature must still work, minus revocation.
process.env.NODE_ENV = 'test';
process.env.REDIS_URL = 'redis://127.0.0.1:1'; // nothing listens here
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/db/prisma');

const api = '/api/v1';
const login = async (email) =>
  (await request(app).post(`${api}/auth/login`).send({ tenant: 'acme', email, password: 'Password123!' })).body.token;
const as = (token) => ({ Authorization: `Bearer ${token}` });

afterAll(() => prisma.$disconnect());

it('reports Redis as down without failing health', async () => {
  const res = await request(app).get('/health');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ status: 'ok', redis: 'down' });
});

it('serves the full purchase flow without Redis', async () => {
  const [requester, approver, procurement] = await Promise.all(
    ['requester', 'approver', 'procurement'].map((r) => login(`${r}@example.com`)),
  );
  expect(requester).toBeTruthy(); // login works via the in-memory rate limiter

  const vendor = await request(app).post(`${api}/vendors`).set(as(procurement)).send({ name: 'No-cache vendor' });
  expect(vendor.status).toBe(201);
  expect((await request(app).get(`${api}/vendors/${vendor.body.id}`).set(as(procurement))).body.name).toBe('No-cache vendor');
  expect((await request(app).get(`${api}/vendors`).set(as(procurement))).status).toBe(200);

  const pr = await request(app).post(`${api}/purchase-requests`).set(as(requester))
    .send({ title: 'Offline', items: [{ description: 'x', quantity: 1, unitPrice: 1 }] });
  await request(app).post(`${api}/purchase-requests/${pr.body.id}/submit`).set(as(requester));
  await request(app).post(`${api}/purchase-requests/${pr.body.id}/approve`).set(as(approver));
  expect((await request(app).get(`${api}/purchase-requests/${pr.body.id}`).set(as(requester))).body.status).toBe('APPROVED');
  const po = await request(app).post(`${api}/purchase-orders`).set(as(procurement))
    .send({ prId: pr.body.id, vendorId: vendor.body.id });
  expect(po.status).toBe(201);
});

it('logout says it is unavailable instead of pretending to revoke', async () => {
  const token = await login('requester@example.com');
  const res = await request(app).post(`${api}/auth/logout`).set(as(token));
  expect(res.status).toBe(503);
  expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
  expect((await request(app).get(`${api}/auth/me`).set(as(token))).status).toBe(200); // token still valid
});

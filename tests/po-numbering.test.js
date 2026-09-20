// BR7 under concurrency: found by the phase 13 load test (concurrent issues collided on the PO number).
process.env.NODE_ENV = 'test';
process.env.LOGIN_RATE_LIMIT = '100000';
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/db/prisma');

const as = (token) => ({ Authorization: `Bearer ${token}` });
const login = async (email) =>
  (await request(app).post('/api/v1/auth/login').send({ tenant: 'acme', email, password: 'Password123!' })).body.token;

afterAll(() => prisma.$disconnect());

it('issues distinct, gap-free PO numbers when many orders are created at once', async () => {
  const [requester, approver, procurement] = await Promise.all(
    ['requester@example.com', 'approver@example.com', 'procurement@example.com'].map(login));
  const vendor = await request(app).post('/api/v1/vendors').set(as(procurement)).send({ name: `Concurrent ${Date.now()}` });

  const approved = await Promise.all(Array.from({ length: 12 }, async (_, i) => {
    const pr = await request(app).post('/api/v1/purchase-requests').set(as(requester))
      .send({ title: `Concurrent ${i}`, items: [{ description: 'Thing', quantity: 1, unitPrice: 10 }] });
    await request(app).post(`/api/v1/purchase-requests/${pr.body.id}/submit`).set(as(requester));
    await request(app).post(`/api/v1/purchase-requests/${pr.body.id}/approve`).set(as(approver));
    return pr.body.id;
  }));

  const results = await Promise.all(approved.map((prId) =>
    request(app).post('/api/v1/purchase-orders').set(as(procurement)).send({ prId, vendorId: vendor.body.id })));

  expect(results.map((r) => r.status)).toEqual(Array(12).fill(201));
  const numbers = results.map((r) => Number(r.body.poNumber.split('-')[2])).sort((a, b) => a - b);
  expect(new Set(numbers).size).toBe(12);
  expect(numbers.at(-1) - numbers[0]).toBe(11); // consecutive
});

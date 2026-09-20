// MongoDB unreachable: the business API keeps working and audit events wait in the Postgres outbox.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URL = 'mongodb://127.0.0.1:1/procurement_audit'; // nothing listens here
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/db/prisma');
const { drainAll } = require('../src/modules/audit/drain');

const api = '/api/v1';
const login = async (email) =>
  (await request(app).post(`${api}/auth/login`).send({ tenant: 'acme', email, password: 'Password123!' })).body.token;
const as = (token) => ({ Authorization: `Bearer ${token}` });

afterAll(() => prisma.$disconnect());

it('reports MongoDB as down without failing health', async () => {
  const res = await request(app).get('/health');
  expect(res.status).toBe(200);
  expect(res.body.mongo).toBe('down');
});

it('serves writes normally and queues their events in the outbox', async () => {
  const procurement = await login('procurement@example.com');
  const before = await prisma.unscoped.auditOutbox.count();
  const vendor = await request(app).post(`${api}/vendors`).set(as(procurement)).send({ name: 'While Mongo is down' });
  expect(vendor.status).toBe(201);
  expect(await prisma.unscoped.auditOutbox.count()).toBe(before + 1);
  expect(await drainAll()).toBe(0); // nothing can be moved, and nothing is lost or thrown
  expect(await prisma.unscoped.auditOutbox.count()).toBe(before + 1);
});

it('the audit endpoint says the store is unavailable instead of returning a partial trail', async () => {
  const admin = await login('admin@example.com');
  const res = await request(app).get(`${api}/audit`).set(as(admin));
  expect(res.status).toBe(503);
  expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
});

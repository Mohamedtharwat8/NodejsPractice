// Phase 5: cache, invalidation, tenant-keyed entries, logout revocation, tenant suspension.
// Needs the docker-compose Postgres and Redis (REDIS_URL in .env) and the seeded tenants.
process.env.NODE_ENV = 'test';
process.env.PLATFORM_API_KEY = 'test-platform-key';
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/db/prisma');
const { client, ready } = require('../src/infra/redis');
const { stats } = require('../src/infra/cache');

const api = '/api/v1';
const PLATFORM = { 'x-platform-key': 'test-platform-key' };
const login = async (email, tenant = 'acme') =>
  (await request(app).post(`${api}/auth/login`).send({ tenant, email, password: 'Password123!' })).body.token;
const as = (token) => ({ Authorization: `Bearer ${token}` });
const me = async (token) => (await request(app).get(`${api}/auth/me`).set(as(token))).body;

beforeAll(async () => {
  for (let i = 0; i < 30 && !ready(); i++) await new Promise((r) => setTimeout(r, 100));
  if (!ready()) throw new Error('Redis is not reachable: run `docker compose up -d --wait redis`');
});
afterAll(() => prisma.$disconnect());

describe('vendor cache', () => {
  let procurementA, procurementB, tidA;

  beforeAll(async () => {
    [procurementA, procurementB] = await Promise.all([
      login('procurement@example.com', 'acme'),
      login('procurement@example.com', 'globex'),
    ]);
    tidA = (await me(procurementA)).tenantId;
  });

  it('serves the second read from cache and reflects updates immediately', async () => {
    const created = await request(app).post(`${api}/vendors`).set(as(procurementA)).send({ name: 'Cache Co' });
    const id = created.body.id;

    const vendor = () => ({ ...(stats.by.vendor || { hits: 0, misses: 0 }) });
    const before = vendor();
    await request(app).get(`${api}/vendors/${id}`).set(as(procurementA)); // miss, fills cache
    await request(app).get(`${api}/vendors/${id}`).set(as(procurementA)); // hit
    expect(vendor().misses - before.misses).toBe(1);
    expect(vendor().hits - before.hits).toBe(1);
    expect(await client.exists(`t:${tidA}:vendor:${id}`)).toBe(1);

    await request(app).patch(`${api}/vendors/${id}`).set(as(procurementA)).send({ name: 'Renamed Co' });
    const after = await request(app).get(`${api}/vendors/${id}`).set(as(procurementA));
    expect(after.body.name).toBe('Renamed Co');
  });

  it('deactivation is visible on the next read', async () => {
    const { body } = await request(app).post(`${api}/vendors`).set(as(procurementA)).send({ name: 'Soon Gone' });
    await request(app).get(`${api}/vendors/${body.id}`).set(as(procurementA));
    await request(app).delete(`${api}/vendors/${body.id}`).set(as(procurementA));
    const res = await request(app).get(`${api}/vendors/${body.id}`).set(as(procurementA));
    expect(res.body.status).toBe('INACTIVE');
  });

  it('a cached list is refreshed after a create', async () => {
    const first = await request(app).get(`${api}/vendors?pageSize=100`).set(as(procurementA));
    await request(app).get(`${api}/vendors?pageSize=100`).set(as(procurementA)); // now cached
    await request(app).post(`${api}/vendors`).set(as(procurementA)).send({ name: 'Newcomer' });
    const second = await request(app).get(`${api}/vendors?pageSize=100`).set(as(procurementA));
    expect(second.body.total).toBe(first.body.total + 1);
  });

  it('cache entries are tenant-keyed: another tenant never sees a cached vendor', async () => {
    const { body } = await request(app).post(`${api}/vendors`).set(as(procurementA)).send({ name: 'A private' });
    await request(app).get(`${api}/vendors/${body.id}`).set(as(procurementA)); // cached under tenant A
    const res = await request(app).get(`${api}/vendors/${body.id}`).set(as(procurementB));
    expect(res.status).toBe(404);
    const keys = await client.keys(`t:*:vendor:${body.id}`);
    expect(keys).toEqual([`t:${tidA}:vendor:${body.id}`]);
  });
});

describe('purchase request cache', () => {
  let requester, approver, procurement, admin, vendorId;
  const newPR = (token) => request(app).post(`${api}/purchase-requests`).set(as(token))
    .send({ title: 'Cached', items: [{ description: 'x', quantity: 1, unitPrice: 5 }] });
  const read = (token, id) => request(app).get(`${api}/purchase-requests/${id}`).set(as(token));

  beforeAll(async () => {
    [requester, approver, procurement, admin] = await Promise.all(
      ['requester', 'approver', 'procurement', 'admin'].map((r) => login(`${r}@example.com`)),
    );
    vendorId = (await request(app).post(`${api}/vendors`).set(as(procurement)).send({ name: 'PR vendor' })).body.id;
  });

  it('every state change shows up on the next read', async () => {
    const { body } = await newPR(requester);
    expect((await read(requester, body.id)).body.status).toBe('DRAFT'); // cached
    await request(app).post(`${api}/purchase-requests/${body.id}/submit`).set(as(requester));
    expect((await read(requester, body.id)).body.status).toBe('SUBMITTED');

    await request(app).post(`${api}/purchase-requests/${body.id}/approve`).set(as(approver));
    const approved = (await read(requester, body.id)).body;
    expect(approved.status).toBe('APPROVED');
    expect(approved.approval.decision).toBe('APPROVED');

    expect((await read(requester, body.id)).body.order).toBeNull(); // cached without an order
    await request(app).post(`${api}/purchase-orders`).set(as(procurement)).send({ prId: body.id, vendorId });
    expect((await read(requester, body.id)).body.order.status).toBe('ISSUED');
  });

  it('cached requests keep their visibility rules', async () => {
    const { body } = await newPR(admin);
    expect((await read(admin, body.id)).status).toBe(200); // cached
    expect((await read(requester, body.id)).status).toBe(404);
  });

  it('state-changing rules never use the cache (BR3 still enforced after a cached read)', async () => {
    const { body } = await newPR(requester);
    await read(requester, body.id); // cache the DRAFT
    await request(app).post(`${api}/purchase-requests/${body.id}/submit`).set(as(requester));
    // A stale DRAFT copy would allow this edit; the database says SUBMITTED.
    const edit = await request(app).patch(`${api}/purchase-requests/${body.id}`).set(as(requester)).send({ title: 'x' });
    expect(edit.status).toBe(409);
  });
});

describe('logout', () => {
  it('revokes only the presented token', async () => {
    const first = await login('requester@example.com');
    const second = await login('requester@example.com');
    expect((await request(app).get(`${api}/auth/me`).set(as(first))).status).toBe(200);

    expect((await request(app).post(`${api}/auth/logout`).set(as(first))).status).toBe(204);
    const after = await request(app).get(`${api}/auth/me`).set(as(first));
    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe('UNAUTHENTICATED');
    expect((await request(app).get(`${api}/auth/me`).set(as(second))).status).toBe(200);
  });
});

describe('tenant suspension', () => {
  it('blocks logins and API calls immediately, and can be reversed', async () => {
    const slug = `susp${Date.now()}`;
    const created = await request(app).post(`${api}/platform/tenants`).set(PLATFORM)
      .send({ name: 'Suspendable', slug, admin: { name: 'Boss', email: 'boss@example.com', password: 'Password123!' } });
    const tenantId = created.body.tenant.id;
    const token = await login('boss@example.com', slug);
    expect((await request(app).get(`${api}/vendors`).set(as(token))).status).toBe(200); // status now cached

    const suspend = await request(app).patch(`${api}/platform/tenants/${tenantId}/status`).set(PLATFORM)
      .send({ status: 'SUSPENDED' });
    expect(suspend.status).toBe(200);
    expect((await request(app).get(`${api}/vendors`).set(as(token))).status).toBe(403);
    const relog = await request(app).post(`${api}/auth/login`)
      .send({ tenant: slug, email: 'boss@example.com', password: 'Password123!' });
    expect(relog.status).toBe(403);

    await request(app).patch(`${api}/platform/tenants/${tenantId}/status`).set(PLATFORM).send({ status: 'ACTIVE' });
    expect((await request(app).get(`${api}/vendors`).set(as(token))).status).toBe(200);
  });

  it('needs the platform key and an existing tenant', async () => {
    expect((await request(app).patch(`${api}/platform/tenants/1/status`).send({ status: 'ACTIVE' })).status).toBe(401);
    const res = await request(app).patch(`${api}/platform/tenants/99999999/status`).set(PLATFORM).send({ status: 'ACTIVE' });
    expect(res.status).toBe(404);
  });
});

describe('health', () => {
  it('reports Redis as up', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toMatchObject({ status: 'ok', redis: 'up' });
  });
});

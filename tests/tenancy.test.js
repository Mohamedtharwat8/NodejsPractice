// Tenant isolation (FR7). Needs the seeded tenants `acme` and `globex`.
process.env.NODE_ENV = 'test';
process.env.PLATFORM_API_KEY = 'test-platform-key';
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/db/prisma');
const { runInTenant } = require('../src/db/tenantContext');

const login = async (email, tenant) =>
  (await request(app).post('/api/v1/auth/login').send({ tenant, email, password: 'Password123!' })).body.token;
const as = (token) => ({ Authorization: `Bearer ${token}` });

afterAll(() => prisma.$disconnect());

describe('tenant isolation', () => {
  let a, b; // tokens per role, per tenant
  let prId, vendorId, poId;

  beforeAll(async () => {
    const roles = ['requester', 'approver', 'procurement', 'admin'];
    const tokens = async (tenant) =>
      Object.fromEntries(await Promise.all(roles.map(async (r) => [r, await login(`${r}@example.com`, tenant)])));
    [a, b] = await Promise.all([tokens('acme'), tokens('globex')]);

    // Tenant A builds a full chain: vendor, approved request, purchase order.
    vendorId = (await request(app).post('/api/v1/vendors').set(as(a.procurement)).send({ name: 'A-only vendor' })).body.id;
    prId = (await request(app).post('/api/v1/purchase-requests').set(as(a.requester))
      .send({ title: 'A-only', items: [{ description: 'x', quantity: 1, unitPrice: 10 }] })).body.id;
    await request(app).post(`/api/v1/purchase-requests/${prId}/submit`).set(as(a.requester));
    await request(app).post(`/api/v1/purchase-requests/${prId}/approve`).set(as(a.approver));
    poId = (await request(app).post('/api/v1/purchase-orders').set(as(a.procurement)).send({ prId, vendorId })).body.id;
  });

  it('tenant A can see its own data', async () => {
    expect((await request(app).get(`/api/v1/vendors/${vendorId}`).set(as(a.procurement))).status).toBe(200);
    expect((await request(app).get(`/api/v1/purchase-orders/${poId}`).set(as(a.procurement))).status).toBe(200);
  });

  it('tenant B gets 404 for every tenant A id', async () => {
    const attempts = [
      request(app).get(`/api/v1/vendors/${vendorId}`).set(as(b.procurement)),
      request(app).patch(`/api/v1/vendors/${vendorId}`).set(as(b.procurement)).send({ name: 'hijack' }),
      request(app).delete(`/api/v1/vendors/${vendorId}`).set(as(b.procurement)),
      request(app).get(`/api/v1/purchase-requests/${prId}`).set(as(b.approver)),
      request(app).patch(`/api/v1/purchase-requests/${prId}`).set(as(b.admin)).send({ title: 'hijack' }),
      request(app).post(`/api/v1/purchase-requests/${prId}/approve`).set(as(b.approver)),
      request(app).get(`/api/v1/purchase-orders/${poId}`).set(as(b.procurement)),
    ];
    for (const res of await Promise.all(attempts)) expect(res.status).toBe(404);
  });

  it('tenant B cannot cancel A\'s order or build one from A\'s request and vendor', async () => {
    expect((await request(app).post(`/api/v1/purchase-orders/${poId}/cancel`).set(as(b.procurement))).status).toBe(409);
    const res = await request(app).post('/api/v1/purchase-orders').set(as(b.procurement)).send({ prId, vendorId });
    expect(res.status).toBe(404);
  });

  it('tenant A\'s data is untouched after B\'s attempts', async () => {
    const vendor = await request(app).get(`/api/v1/vendors/${vendorId}`).set(as(a.procurement));
    expect(vendor.body.name).toBe('A-only vendor');
    expect(vendor.body.status).toBe('ACTIVE');
    const po = await request(app).get(`/api/v1/purchase-orders/${poId}`).set(as(a.procurement));
    expect(po.body.status).toBe('ISSUED');
  });

  it('lists never include another tenant\'s rows', async () => {
    const [vendors, requests, orders] = await Promise.all([
      request(app).get('/api/v1/vendors?pageSize=100').set(as(b.procurement)),
      request(app).get('/api/v1/purchase-requests?pageSize=100').set(as(b.approver)),
      request(app).get('/api/v1/purchase-orders?pageSize=100').set(as(b.procurement)),
    ]);
    expect(vendors.body.data.some((v) => v.id === vendorId)).toBe(false);
    expect(requests.body.data.some((p) => p.id === prId)).toBe(false);
    expect(orders.body.data.some((o) => o.id === poId)).toBe(false);
  });

  it('login is per tenant: same email, different tenant, different user', async () => {
    const me = async (token) => (await request(app).get('/api/v1/auth/me').set(as(token))).body;
    const [ma, mb] = await Promise.all([me(a.requester), me(b.requester)]);
    expect(ma.email).toBe(mb.email);
    expect(ma.id).not.toBe(mb.id);
    expect(ma.tenantId).not.toBe(mb.tenantId);
  });

  it('login fails for an unknown tenant', async () => {
    const res = await request(app).post('/api/v1/auth/login')
      .send({ tenant: 'nope', email: 'admin@example.com', password: 'Password123!' });
    expect(res.status).toBe(401);
  });

  it('register creates the user in the admin\'s own tenant', async () => {
    const email = `new-${Date.now()}@example.com`;
    const created = await request(app).post('/api/v1/auth/register').set(as(b.admin))
      .send({ name: 'New', email, password: 'Password123!', role: 'REQUESTER' });
    expect(created.status).toBe(201);
    const ma = (await request(app).get('/api/v1/auth/me').set(as(b.admin))).body;
    expect(created.body.tenantId).toBe(ma.tenantId);
    // The user cannot log in to the other tenant.
    const other = await request(app).post('/api/v1/auth/login').send({ tenant: 'acme', email, password: 'Password123!' });
    expect(other.status).toBe(401);
  });

  it('rejects tokens without a tenant claim', async () => {
    const jwt = require('jsonwebtoken');
    const old = jwt.sign({ role: 'ADMIN' }, 'test-secret', { subject: '1' });
    expect((await request(app).get('/api/v1/vendors').set(as(old))).status).toBe(401);
  });

  it('the data layer fails closed without a tenant context', async () => {
    await expect(prisma.vendor.findMany()).rejects.toThrow(/No tenant context/);
    await expect(runInTenant(undefined, () => prisma.vendor.findMany())).rejects.toThrow(/No tenant context/);
  });
});

describe('platform tenant onboarding', () => {
  const body = () => {
    const slug = `t${Date.now()}`;
    return { name: 'New Co', slug, admin: { name: 'Boss', email: 'boss@example.com', password: 'Password123!' } };
  };

  it('requires the platform key', async () => {
    expect((await request(app).post('/api/v1/platform/tenants').send(body())).status).toBe(401);
    expect((await request(app).post('/api/v1/platform/tenants').set('x-platform-key', 'wrong').send(body())).status).toBe(401);
  });

  it('creates a tenant and its admin, who can log in and sees nothing from other tenants', async () => {
    const payload = body();
    const res = await request(app).post('/api/v1/platform/tenants').set('x-platform-key', 'test-platform-key').send(payload);
    expect(res.status).toBe(201);
    expect(res.body.admin.role).toBe('ADMIN');

    const token = await login('boss@example.com', payload.slug);
    expect(token).toBeTruthy();
    const vendors = await request(app).get('/api/v1/vendors').set(as(token));
    expect(vendors.body.total).toBe(0);
  });

  it('rejects a duplicate slug and a bad slug', async () => {
    const payload = body();
    await request(app).post('/api/v1/platform/tenants').set('x-platform-key', 'test-platform-key').send(payload);
    const dup = await request(app).post('/api/v1/platform/tenants').set('x-platform-key', 'test-platform-key').send(payload);
    expect(dup.status).toBe(409);
    const bad = await request(app).post('/api/v1/platform/tenants').set('x-platform-key', 'test-platform-key')
      .send({ ...body(), slug: 'Bad Slug!' });
    expect(bad.status).toBe(400);
  });
});

// Cursor and offset pagination on the purchase request and purchase order lists.
// Uses a fresh tenant so the data (and the expected page contents) are exact.
process.env.NODE_ENV = 'test';
process.env.PLATFORM_API_KEY = 'test-platform-key';
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/db/prisma');

const api = '/api/v1';
const as = (token) => ({ Authorization: `Bearer ${token}` });
const password = 'Password123!';
const login = async (tenant, email) =>
  (await request(app).post(`${api}/auth/login`).send({ tenant, email, password })).body.token;

let requester, approver, procurement, prIds, poIds;

beforeAll(async () => {
  const slug = `page${Date.now()}`;
  await request(app).post(`${api}/platform/tenants`).set({ 'x-platform-key': 'test-platform-key' })
    .send({ name: 'Paging Co', slug, admin: { name: 'Boss', email: 'boss@example.com', password } });
  const admin = await login(slug, 'boss@example.com');
  for (const [name, role] of [['requester', 'REQUESTER'], ['approver', 'APPROVER'], ['procurement', 'PROCUREMENT']]) {
    await request(app).post(`${api}/auth/register`).set(as(admin)).send({ name, email: `${name}@example.com`, password, role });
  }
  [requester, approver, procurement] = await Promise.all(
    ['requester', 'approver', 'procurement'].map((n) => login(slug, `${n}@example.com`)),
  );

  // Five requests (oldest first); the first three become approved requests with a purchase order.
  prIds = [];
  for (let i = 1; i <= 5; i++) {
    const res = await request(app).post(`${api}/purchase-requests`).set(as(requester))
      .send({ title: `Request ${i}`, items: [{ description: 'x', quantity: 1, unitPrice: 1 }] });
    prIds.push(res.body.id);
  }
  const vendor = await request(app).post(`${api}/vendors`).set(as(procurement)).send({ name: 'Paging vendor' });
  poIds = [];
  for (const id of prIds.slice(0, 3)) {
    await request(app).post(`${api}/purchase-requests/${id}/submit`).set(as(requester));
    await request(app).post(`${api}/purchase-requests/${id}/approve`).set(as(approver));
    const po = await request(app).post(`${api}/purchase-orders`).set(as(procurement)).send({ prId: id, vendorId: vendor.body.id });
    poIds.push(po.body.id);
  }
});
afterAll(() => prisma.$disconnect());

const newestFirst = (ids) => [...ids].reverse();
const get = (url, token) => request(app).get(`${api}${url}`).set(as(token));

// Walks every page with the returned cursor and returns the ids in the order received.
async function walk(url, token, pageSize) {
  const seen = [];
  let cursor;
  for (let i = 0; i < 20; i++) {
    const res = await get(`${url}${url.includes('?') ? '&' : '?'}pageSize=${pageSize}${cursor ? `&cursor=${cursor}` : ''}`, token);
    expect(res.status).toBe(200);
    seen.push(...res.body.data.map((r) => r.id));
    if (!res.body.nextCursor) return seen;
    cursor = res.body.nextCursor;
  }
  throw new Error('cursor never ended');
}

describe('cursor pagination', () => {
  it('walks all requests newest-first without gaps or repeats', async () => {
    expect(await walk('/purchase-requests', requester, 2)).toEqual(newestFirst(prIds));
  });

  it('cursor pages carry no total and end with a null cursor', async () => {
    const first = await get('/purchase-requests?pageSize=2', requester);
    const second = await get(`/purchase-requests?pageSize=2&cursor=${first.body.nextCursor}`, requester);
    expect(Object.keys(second.body).sort()).toEqual(['data', 'nextCursor', 'pageSize']);
    const last = await get(`/purchase-requests?pageSize=5&cursor=${first.body.nextCursor}`, requester);
    expect(last.body.data.length).toBe(3);
    expect(last.body.nextCursor).toBeNull();
  });

  it('works together with the status filter', async () => {
    expect(await walk('/purchase-requests?status=APPROVED', requester, 2)).toEqual(newestFirst(prIds.slice(0, 3)));
    expect(await walk('/purchase-requests?status=DRAFT', requester, 1)).toEqual(newestFirst(prIds.slice(3)));
  });

  it('pages purchase orders the same way', async () => {
    expect(await walk('/purchase-orders', procurement, 2)).toEqual(newestFirst(poIds));
    expect(await walk('/purchase-orders?status=ISSUED', procurement, 1)).toEqual(newestFirst(poIds));
  });

  it('a request created mid-walk does not shift the next page', async () => {
    const first = await get('/purchase-requests?pageSize=2', requester);
    const created = await request(app).post(`${api}/purchase-requests`).set(as(requester))
      .send({ title: 'Late arrival', items: [{ description: 'x', quantity: 1, unitPrice: 1 }] });
    const second = await get(`/purchase-requests?pageSize=2&cursor=${first.body.nextCursor}`, requester);
    const ids = [...first.body.data, ...second.body.data].map((r) => r.id);
    expect(new Set(ids).size).toBe(4); // no repeats
    expect(ids).not.toContain(created.body.id);
    expect(ids).toEqual(newestFirst(prIds.slice(0, 5)).slice(0, 4)); // the original order, undisturbed
  });

  it('rejects malformed cursors with a 400', async () => {
    for (const bad of ['zzz', 'not base64!', Buffer.from('-5').toString('base64url'), Buffer.from('abc').toString('base64url')]) {
      const res = await get(`/purchase-requests?cursor=${bad}`, requester);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('keeps tenant isolation: a huge cursor still only returns own rows', async () => {
    const other = await request(app).post(`${api}/auth/login`)
      .send({ tenant: 'globex', email: 'procurement@example.com', password });
    const res = await get(`/purchase-orders?cursor=${Buffer.from('999999999').toString('base64url')}&pageSize=100`, other.body.token);
    expect(res.status).toBe(200);
    expect(res.body.data.every((po) => !poIds.includes(po.id))).toBe(true);
  });
});

describe('offset pagination (unchanged, plus nextCursor)', () => {
  it('still returns total, page and pageSize', async () => {
    const res = await get('/purchase-requests?page=2&pageSize=2', requester);
    expect(res.body.total).toBeGreaterThanOrEqual(5);
    expect(res.body).toMatchObject({ page: 2, pageSize: 2 });
    expect(res.body.data.length).toBe(2);
  });

  it('nextCursor continues exactly where the offset page ended', async () => {
    const page1 = await get('/purchase-requests?page=1&pageSize=2', requester);
    const viaCursor = await get(`/purchase-requests?pageSize=2&cursor=${page1.body.nextCursor}`, requester);
    const page2 = await get('/purchase-requests?page=2&pageSize=2', requester);
    expect(viaCursor.body.data.map((r) => r.id)).toEqual(page2.body.data.map((r) => r.id));
  });

  it('nextCursor is null on the last page', async () => {
    const res = await get('/purchase-orders?page=1&pageSize=100', procurement);
    expect(res.body.nextCursor).toBeNull();
  });
});

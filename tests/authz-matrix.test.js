// Per-endpoint authorisation matrix (BRD acceptance, phase 13). Needs a migrated + seeded Postgres.
// Every mounted route must be listed here, so adding an endpoint without deciding who may call it fails the suite.
process.env.NODE_ENV = 'test';
process.env.PLATFORM_API_KEY = 'test-platform-key';
process.env.LOGIN_RATE_LIMIT = '100000';
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/db/prisma');
const v1 = require('../src/routes/v1');

const ROLES = ['REQUESTER', 'APPROVER', 'PROCUREMENT', 'ADMIN'];
const EMAIL = {
  REQUESTER: 'requester@example.com', APPROVER: 'approver@example.com',
  PROCUREMENT: 'procurement@example.com', ADMIN: 'admin@example.com',
};
const ANY = ROLES;
const NOT_FOUND_ID = 999999999;

// route -> roles allowed to pass the authorisation layer. 'public' needs no token; 'platform' needs x-platform-key.
// `probe: false` skips the authenticated calls that would change the caller's session.
const MATRIX = {
  'POST /auth/login': { access: 'public' },
  'POST /auth/logout': { access: ANY, probe: false },
  'POST /auth/register': { access: ['ADMIN'] },
  'GET /auth/me': { access: ANY },
  'GET /audit': { access: ['ADMIN'] },
  'GET /settings/webhook': { access: ['ADMIN'] },
  'PUT /settings/webhook': { access: ['ADMIN'] },
  'GET /notifications': { access: ANY },
  'POST /notifications/read-all': { access: ANY },
  'POST /notifications/:id/read': { access: ANY },
  'GET /vendors': { access: ANY },
  'GET /vendors/:id': { access: ANY },
  'POST /vendors': { access: ['PROCUREMENT', 'ADMIN'] },
  'PATCH /vendors/:id': { access: ['PROCUREMENT', 'ADMIN'] },
  'DELETE /vendors/:id': { access: ['PROCUREMENT', 'ADMIN'] },
  'POST /purchase-requests': { access: ANY },
  'GET /purchase-requests': { access: ANY },
  'GET /purchase-requests/:id': { access: ANY },
  'PATCH /purchase-requests/:id': { access: ANY },
  'POST /purchase-requests/:id/submit': { access: ANY },
  'POST /purchase-requests/:id/approve': { access: ['APPROVER', 'ADMIN'] },
  'POST /purchase-requests/:id/reject': { access: ['APPROVER', 'ADMIN'] },
  'POST /purchase-orders': { access: ['PROCUREMENT', 'ADMIN'] },
  'GET /purchase-orders': { access: ['PROCUREMENT', 'ADMIN'] },
  'GET /purchase-orders/:id': { access: ['PROCUREMENT', 'ADMIN'] },
  'POST /purchase-orders/:id/cancel': { access: ['PROCUREMENT', 'ADMIN'] },
  'POST /platform/tenants': { access: 'platform' },
  'PATCH /platform/tenants/:id/status': { access: 'platform' },
  'GET /platform/dead-letters': { access: 'platform' },
  'POST /platform/dead-letters/:id/retry': { access: 'platform' },
};

// The routes actually mounted on the v1 router, read from Express rather than from a hand-kept list.
const mounted = v1.mounts.flatMap(([prefix, router]) =>
  router.stack.filter((layer) => layer.route).flatMap((layer) =>
    Object.keys(layer.route.methods).map((method) => `${method.toUpperCase()} ${prefix}${layer.route.path === '/' ? '' : layer.route.path}`)));

const call = (key, headers = {}) => {
  const [method, path] = key.split(' ');
  return request(app)[method.toLowerCase()](`/api/v1${path.replace(':id', NOT_FOUND_ID)}`).set(headers).send({});
};

const tokens = {};
beforeAll(async () => {
  for (const role of ROLES) {
    const res = await request(app).post('/api/v1/auth/login').send({ tenant: 'acme', email: EMAIL[role], password: 'Password123!' });
    tokens[role] = res.body.token;
  }
});
afterAll(() => prisma.$disconnect());

it('lists every mounted route in the matrix, and nothing else', () => {
  expect([...mounted].sort()).toEqual(Object.keys(MATRIX).sort());
});

describe.each(Object.entries(MATRIX).filter(([, rule]) => rule.access !== 'public'))('%s', (key, rule) => {
  if (rule.access === 'platform') {
    it('rejects a missing or wrong platform key, and never accepts a tenant token', async () => {
      expect((await call(key)).status).toBe(401);
      expect((await call(key, { 'x-platform-key': 'wrong' })).status).toBe(401);
      expect((await call(key, { Authorization: `Bearer ${tokens.ADMIN}` })).status).toBe(401);
    });
    it('lets the platform key through the authorisation layer', async () => {
      expect([401, 403]).not.toContain((await call(key, { 'x-platform-key': 'test-platform-key' })).status);
    });
    return;
  }

  it('rejects requests without a token or with a malformed one', async () => {
    expect((await call(key)).status).toBe(401);
    expect((await call(key, { Authorization: 'Bearer not-a-jwt' })).status).toBe(401);
  });

  it.each(ROLES)('%s', async (role) => {
    if (rule.probe === false) return;
    const status = (await call(key, { Authorization: `Bearer ${tokens[role]}` })).status;
    if (rule.access.includes(role)) expect([401, 403]).not.toContain(status);
    else expect(status).toBe(403);
  });
});

it('logout revokes the token it was called with', async () => {
  const login = await request(app).post('/api/v1/auth/login').send({ tenant: 'acme', email: EMAIL.REQUESTER, password: 'Password123!' });
  const auth = { Authorization: `Bearer ${login.body.token}` };
  expect((await request(app).get('/api/v1/auth/me').set(auth)).status).toBe(200);
  expect((await request(app).post('/api/v1/auth/logout').set(auth)).status).toBeLessThan(300);
  // Revocation needs Redis; without it logout is best-effort and the token stays valid until it expires.
  if (require('../src/infra/redis').ready()) expect((await request(app).get('/api/v1/auth/me').set(auth)).status).toBe(401);
});

// API surface: versioning, error shape, and the OpenAPI contract. Most checks need no auth.
process.env.NODE_ENV = 'test';
process.env.PLATFORM_API_KEY = 'test-platform-key';
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/db/prisma');
const apiVersion = require('../src/middleware/apiVersion');
const v1 = require('../src/routes/v1');
const { buildSpec, operations } = require('../src/docs/openapi');

afterAll(() => prisma.$disconnect());

const spec = buildSpec();
const fill = (path) => path.replace('{id}', '1');
const send = (op) => request(app)[op.method](`/api/v1${fill(op.path)}`);

describe('versioning', () => {
  it('serves the API under /api/v1 and marks the version', async () => {
    const res = await request(app).get('/api/v1/vendors');
    expect(res.headers['x-api-version']).toBe('v1');
    expect(res.headers.deprecation).toBeUndefined();
  });

  it('no longer serves unversioned routes', async () => {
    const res = await request(app).get('/vendors');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('unknown versions are 404', async () => {
    expect((await request(app).get('/api/v2/vendors')).status).toBe(404);
  });

  it('a deprecated version answers with Deprecation, Sunset and Link headers', () => {
    const headers = {};
    const res = { set: (k, v) => { headers[k] = v; }, append: (k, v) => { headers[k] = v; } };
    apiVersion('v1', {
      v1: { status: 'deprecated', deprecatedOn: '2027-01-01', sunset: '2027-07-01', successor: '/api/v2' },
    })({}, res, () => {});
    expect(headers['X-API-Version']).toBe('v1');
    expect(headers.Deprecation).toBe(`@${Date.parse('2027-01-01') / 1000}`);
    expect(headers.Sunset).toBe('Thu, 01 Jul 2027 00:00:00 GMT');
    expect(headers.Link).toBe('</api/v2>; rel="successor-version"');
  });
});

describe('error shape', () => {
  it('validation errors carry a code and details', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });

  it('auth errors carry a code', async () => {
    const res = await request(app).get('/api/v1/vendors');
    expect(res.status).toBe(401);
    expect(res.body.error).toEqual({ code: 'UNAUTHENTICATED', message: 'Missing token' });
  });

  it('malformed JSON is a 400, not a 500', async () => {
    const res = await request(app).post('/api/v1/auth/login')
      .set('Content-Type', 'application/json').send('{bad json');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('OpenAPI contract', () => {
  it('is served at /docs/openapi.json and the UI at /docs', async () => {
    const json = await request(app).get('/docs/openapi.json');
    expect(json.status).toBe(200);
    expect(json.body.openapi).toBe('3.1.0');
    const ui = await request(app).get('/docs/');
    expect(ui.status).toBe(200);
    expect(ui.text).toContain('swagger-ui');
  });

  it('every $ref resolves', () => {
    const refs = JSON.stringify(spec).match(/#\/components\/schemas\/\w+/g) || [];
    expect(refs.length).toBeGreaterThan(0);
    for (const r of refs) expect(spec.components.schemas[r.split('/').pop()]).toBeDefined();
  });

  it('every documented endpoint exists, and unauthenticated calls return a documented status', async () => {
    for (const op of operations) {
      const res = await send(op);
      expect(res.body.error?.message).not.toBe('Route not found');
      const documented = Object.keys(spec.paths[op.path][op.method].responses).map(Number);
      expect({ op: `${op.method} ${op.path}`, status: res.status, ok: documented.includes(res.status) })
        .toEqual({ op: `${op.method} ${op.path}`, status: res.status, ok: true });
    }
  });

  it('every mounted route is documented', () => {
    const documented = new Set(operations.map((o) => `${o.method} ${o.path}`));
    const mounted = [];
    for (const [prefix, sub] of v1.mounts) {
      for (const layer of sub.stack.filter((l) => l.route)) {
        for (const method of Object.keys(layer.route.methods)) {
          const path = (prefix + (layer.route.path === '/' ? '' : layer.route.path)).replace(/:(\w+)/g, '{$1}');
          mounted.push(`${method} ${path}`);
        }
      }
    }
    expect(mounted.length).toBe(operations.length);
    for (const m of mounted) expect(documented.has(m)).toBe(true);
  });

  it('documents request bodies from the same schemas the routes validate', () => {
    const body = spec.paths['/purchase-requests'].post.requestBody.content['application/json'].schema;
    expect(body.required).toEqual(['title', 'items']);
    expect(body.properties.items.minItems).toBe(1);
    const params = spec.paths['/vendors'].get.parameters.map((p) => p.name);
    expect(params).toEqual(['status', 'page', 'pageSize']);
  });
});

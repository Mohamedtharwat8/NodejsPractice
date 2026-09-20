// Phase 13 security posture: production config guards, CORS and response headers. No database needed.
const request = require('supertest');

const KEYS = ['REDIS_URL', 'MONGODB_URL', 'NODE_ENV', 'JWT_SECRET', 'PLATFORM_API_KEY', 'CORS_ORIGINS', 'DATABASE_URL'];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of KEYS) saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]);
});

function loadIn(env, load) {
  // Empty URLs keep the isolated app from opening Redis/Mongo connections (dotenv does not override set variables).
  Object.assign(process.env, { DATABASE_URL: 'postgresql://x', REDIS_URL: '', MONGODB_URL: '', ...env });
  let result;
  jest.isolateModules(() => { result = load(); });
  return result;
}

describe('production config guards', () => {
  const prod = { NODE_ENV: 'production', JWT_SECRET: 'a-long-random-signing-secret' };

  it.each(['change-me', 'short', 'dev-change-me-please-long'])('rejects the weak JWT secret %p', (secret) => {
    expect(() => loadIn({ ...prod, JWT_SECRET: secret }, () => require('../src/config/env'))).toThrow(/JWT_SECRET/);
  });

  it('rejects a placeholder platform key when platform routes are enabled', () => {
    expect(() => loadIn({ ...prod, PLATFORM_API_KEY: 'change-me-platform-key' }, () => require('../src/config/env'))).toThrow(/PLATFORM_API_KEY/);
  });

  it('accepts strong secrets', () => {
    const env = loadIn({ ...prod, PLATFORM_API_KEY: 'another-long-random-platform-key' }, () => require('../src/config/env'));
    expect(env.jwtSecret).toBe(prod.JWT_SECRET);
  });

  it('does not enforce the guard outside production', () => {
    expect(() => loadIn({ NODE_ENV: 'development', JWT_SECRET: 'change-me' }, () => require('../src/config/env'))).not.toThrow();
  });
});

describe('CORS in production', () => {
  const appFor = (origins) => loadIn(
    { NODE_ENV: 'production', JWT_SECRET: 'a-long-random-signing-secret', CORS_ORIGINS: origins },
    () => require('../src/app'),
  );

  it('sends no CORS headers to unlisted origins', async () => {
    const res = await request(appFor('https://portal.example.com')).get('/health').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows a listed origin', async () => {
    const res = await request(appFor('https://portal.example.com')).get('/health').set('Origin', 'https://portal.example.com');
    expect(res.headers['access-control-allow-origin']).toBe('https://portal.example.com');
  });

  it('allows no browser origin when none are configured', async () => {
    const res = await request(appFor('')).get('/health').set('Origin', 'https://portal.example.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('response headers', () => {
  it('sets helmet defaults and does not advertise Express', async () => {
    process.env.NODE_ENV = 'test';
    const res = await request(require('../src/app')).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-frame-options']).toBeDefined();
  });
});

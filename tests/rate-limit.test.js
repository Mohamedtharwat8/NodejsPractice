// Login rate limit shared through Redis. Runs with a low limit and cleans up its counter.
process.env.NODE_ENV = 'test';
process.env.LOGIN_RATE_LIMIT = '3';
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/db/prisma');
const { client, ready } = require('../src/infra/redis');

const clearCounters = async () => {
  const keys = await client.keys('rl:login:*');
  if (keys.length) await client.del(...keys);
};

beforeAll(async () => {
  for (let i = 0; i < 30 && !ready(); i++) await new Promise((r) => setTimeout(r, 100));
  if (!ready()) throw new Error('Redis is not reachable: run `docker compose up -d --wait redis`');
});
afterAll(() => prisma.$disconnect());

it('allows the configured number of attempts, then answers 429 with a code', async () => {
  await clearCounters();
  try {
    const attempt = () => request(app).post('/api/v1/auth/login')
      .send({ tenant: 'acme', email: 'admin@example.com', password: 'wrong-password' });

    for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401);

    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(blocked.headers['retry-after']).toBeDefined();

    const keys = await client.keys('rl:login:*');
    expect(keys.length).toBe(1); // the counter lives in Redis, so it is shared across API instances
    expect(await client.ttl(keys[0])).toBeGreaterThan(0); // and expires by itself
  } finally {
    await clearCounters(); // do not leak attempts into other test files
  }
});

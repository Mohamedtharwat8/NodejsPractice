// Latency of the list endpoints against the load-test tenant (npm run db:load first).
// Runs the app in-process, so the numbers are database + application time without network overhead.
//   npm run bench            npm run bench -- --n=200
process.env.NODE_ENV = 'test';
process.env.LOGIN_RATE_LIMIT = '100000';
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/db/prisma');
const redis = require('../src/infra/redis');

const N = Number((process.argv.find((a) => a.startsWith('--n=')) || '--n=100').split('=')[1]);
const WARMUP = 5;
const api = '/api/v1';

const login = async (email) =>
  (await request(app).post(`${api}/auth/login`).send({ tenant: 'loadtest', email, password: 'Password123!' })).body.token;

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];

async function measure(name, token, url) {
  const call = () => request(app).get(url).set('Authorization', `Bearer ${token}`);
  const probe = await call();
  if (probe.status !== 200) return { name, error: `HTTP ${probe.status}` };
  for (let i = 0; i < WARMUP; i++) await call();
  const times = [];
  for (let i = 0; i < N; i++) {
    const t0 = process.hrtime.bigint();
    await call();
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  times.sort((a, b) => a - b);
  return { name, p50: pct(times, 50), p95: pct(times, 95), max: times[times.length - 1] };
}

async function main() {
  const [admin, procurement, requester] = await Promise.all(
    ['admin@load.test', 'procurement@load.test', 'requester1@load.test'].map((e) => login(e)),
  );
  // A small tenant sharing the database with the big one.
  const smallLogin = async (email) =>
    (await request(app).post(`${api}/auth/login`).send({ tenant: 'acme', email, password: 'Password123!' })).body.token;
  const [smallApprover, smallProcurement] = await Promise.all(['approver@example.com', 'procurement@example.com'].map(smallLogin));
  if (!admin) throw new Error('loadtest tenant missing: run `npm run db:load`');

  // Cursor scenarios only run once the API supports `cursor` (phase 6).
  const firstPage = await request(app).get(`${api}/purchase-requests?pageSize=20`).set('Authorization', `Bearer ${admin}`);
  const deepCursor = Buffer.from(String(Math.max(1, (firstPage.body.data?.[0]?.id ?? 1) - 40000))).toString('base64url');

  const scenarios = [
    ['PR list, first page', admin, `${api}/purchase-requests?pageSize=20`],
    ['PR list, status=APPROVED', admin, `${api}/purchase-requests?status=APPROVED&pageSize=20`],
    ['PR list, page 2000 (offset 40k)', admin, `${api}/purchase-requests?page=2000&pageSize=20`],
    ['PR list, requester (own ~2k)', requester, `${api}/purchase-requests?pageSize=20`],
    ['PO list, first page', procurement, `${api}/purchase-orders?pageSize=20`],
    ['PO list, status=ISSUED page 500', procurement, `${api}/purchase-orders?status=ISSUED&page=500&pageSize=20`],
    ['PR list, SMALL tenant', smallApprover, `${api}/purchase-requests?pageSize=20`],
    ['PR list, SMALL tenant, status=DRAFT', smallApprover, `${api}/purchase-requests?status=DRAFT&pageSize=20`],
    ['PO list, SMALL tenant', smallProcurement, `${api}/purchase-orders?pageSize=20`],
    ['Vendor list (200 rows)', admin, `${api}/vendors?pageSize=100`],
    ['PR list, cursor deep (~40k rows in)', admin, `${api}/purchase-requests?pageSize=20&cursor=${deepCursor}`],
    ['PR list, cursor + status=APPROVED', admin, `${api}/purchase-requests?status=APPROVED&pageSize=20&cursor=${deepCursor}`],
  ];

  const rows = [];
  for (const [name, token, url] of scenarios) rows.push(await measure(name, token, url));

  const f = (n) => n.toFixed(1).padStart(7);
  console.log(`\n${N} requests per scenario after ${WARMUP} warm-ups (ms)\n`);
  console.log('scenario'.padEnd(40), '    p50', '    p95', '    max');
  for (const r of rows) {
    console.log(r.name.padEnd(40), r.error ? r.error : `${f(r.p50)} ${f(r.p95)} ${f(r.max)}`);
  }
  const slow = rows.filter((r) => r.p95 >= 300);
  console.log(slow.length ? `\np95 >= 300ms: ${slow.map((r) => r.name).join('; ')}` : '\nAll scenarios under the 300ms p95 target.');
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(async () => { redis.close(); await prisma.$disconnect(); });

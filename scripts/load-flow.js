// Load test of the main flow over HTTP: create request -> submit -> approve -> issue purchase order.
// Run against a live API (docker compose up -d --wait; npm run db:seed), so it includes network and the real stack.
//   npm run load:flow                            20 flows, 5 at a time, against http://127.0.0.1:3000
//   npm run load:flow -- --flows=500 --concurrency=25 --tenant=acme
//   BASE_URL=http://localhost:8080 npm run load:flow      through the nginx proxy
// Exits non-zero when any step fails or the flow p95 exceeds --p95-budget (default 300 ms per step).
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
};
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const FLOWS = Number(arg('flows', 20));
const CONCURRENCY = Number(arg('concurrency', 5));
const TENANT = arg('tenant', 'acme');
const BUDGET_MS = Number(arg('p95-budget', 300));

const steps = new Map(); // step name -> durations in ms
const failures = [];

async function call(step, method, path, token, body) {
  const t0 = process.hrtime.bigint();
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  if (!steps.has(step)) steps.set(step, []);
  steps.get(step).push(ms);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    failures.push(`${step}: HTTP ${res.status} ${json.error?.message || ''}`.trim());
    return null;
  }
  return json;
}

const login = async (email) =>
  (await call('login', 'POST', '/auth/login', null, { tenant: TENANT, email, password: 'Password123!' }))?.token;

async function oneFlow(n, tokens, vendorId) {
  const pr = await call('create request', 'POST', '/purchase-requests', tokens.requester, {
    title: `Load flow ${n}`,
    justification: 'load test',
    items: [{ description: 'Widget', quantity: 2, unitPrice: 25 }, { description: 'Gadget', quantity: 1, unitPrice: 90 }],
  });
  if (!pr) return;
  if (!(await call('submit', 'POST', `/purchase-requests/${pr.id}/submit`, tokens.requester))) return;
  if (!(await call('approve', 'POST', `/purchase-requests/${pr.id}/approve`, tokens.approver, { comment: 'ok' }))) return;
  await call('issue order', 'POST', '/purchase-orders', tokens.procurement, { prId: pr.id, vendorId });
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];

async function main() {
  const [requester, approver, procurement] = await Promise.all(
    ['requester@example.com', 'approver@example.com', 'procurement@example.com'].map(login),
  );
  if (!requester || !approver || !procurement) throw new Error(`Login failed for tenant ${TENANT}; is the API up and seeded?`);
  const tokens = { requester, approver, procurement };
  const vendor = await call('create vendor', 'POST', '/vendors', procurement, { name: `Load vendor ${Date.now()}` });
  if (!vendor) throw new Error('Could not create a vendor');

  let next = 0;
  const started = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < FLOWS) await oneFlow(next++, tokens, vendor.id);
  }));
  const seconds = (Date.now() - started) / 1000;

  console.log(`\n${FLOWS} flows, ${CONCURRENCY} concurrent, tenant ${TENANT}, ${BASE}`);
  console.log(`${(FLOWS / seconds).toFixed(1)} flows/s over ${seconds.toFixed(1)} s\n`);
  console.log('step'.padEnd(16), 'calls'.padStart(6), 'p50'.padStart(8), 'p95'.padStart(8), 'max'.padStart(8));
  let over = false;
  for (const [name, times] of steps) {
    const sorted = [...times].sort((a, b) => a - b);
    const p95 = pct(sorted, 95);
    if (name !== 'login' && p95 > BUDGET_MS) over = true;
    console.log(name.padEnd(16), String(sorted.length).padStart(6), pct(sorted, 50).toFixed(1).padStart(8), p95.toFixed(1).padStart(8), sorted.at(-1).toFixed(1).padStart(8));
  }
  console.log(`\nfailures: ${failures.length}`);
  for (const [msg, count] of Object.entries(failures.reduce((acc, m) => ({ ...acc, [m]: (acc[m] || 0) + 1 }), {}))) console.log(`  ${count} x ${msg}`);
  if (failures.length || over) {
    if (over) console.log(`p95 above ${BUDGET_MS} ms budget`);
    process.exit(1);
  }
}

main().catch((err) => { console.error(err.message); process.exit(1); });

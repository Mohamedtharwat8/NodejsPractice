const prisma = require('../../db/prisma');
const redis = require('../../infra/redis');
const queues = require('../../infra/queue');
const { JOBS } = require('./index');

const BATCH = 200;
const ADD_TIMEOUT_MS = 3000;

const withTimeout = (promise) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error('queue add timed out')), ADD_TIMEOUT_MS).unref()),
]);

// Publishes outbox events to the job queue and deletes them from Postgres. Idempotent: every job id is
// derived from the outbox row (`notify-12`), and BullMQ ignores a second add with the same id, so a relay
// that crashes between "queued" and "deleted" just republishes harmlessly. Returns how many events it published.
async function relay() {
  if (!queues.enabled() || !redis.ready()) return 0;
  const db = prisma.unscoped; // spans tenants; the extended client would refuse without a tenant context
  const rows = await db.eventOutbox.findMany({ orderBy: { id: 'asc' }, take: BATCH });
  if (!rows.length) return 0;

  const published = [];
  try {
    for (const row of rows) {
      const jobs = JOBS[row.type].map((name) => ({
        name,
        data: {
          eventId: row.id,
          tenantId: row.tenantId,
          type: row.type,
          payload: row.payload,
          correlationId: row.correlationId,
          occurredAt: row.createdAt,
        },
        opts: { jobId: `${name}-${row.id}` },
      }));
      await withTimeout(queues.queue().addBulk(jobs));
      published.push(row.id);
    }
  } finally {
    if (published.length) await db.eventOutbox.deleteMany({ where: { id: { in: published } } });
  }
  return published.length;
}

// Publishes until the outbox is empty or Redis stops accepting jobs.
async function relayAll() {
  let total = 0;
  for (;;) {
    let moved;
    try { moved = await relay(); } catch { return total; }
    total += moved;
    if (moved < BATCH) return total;
  }
}

function startRelay(intervalMs = 2000) {
  const timer = setInterval(() => { relayAll().catch(() => {}); }, intervalMs);
  timer.unref();
  relayAll().catch(() => {});
  return () => clearInterval(timer);
}

module.exports = { relay, relayAll, startRelay };

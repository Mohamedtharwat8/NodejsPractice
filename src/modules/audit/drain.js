const prisma = require('../../db/prisma');
const mongo = require('../../infra/mongo');
const { auditRetentionDays } = require('../../config/env');
const AuditEvent = require('./audit.model');

const BATCH = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

const toDocument = (row) => ({
  outboxId: row.id,
  tenantId: row.tenantId,
  actorId: row.actorId ?? undefined,
  action: row.action,
  entity: row.entity,
  entityId: row.entityId,
  before: row.before ?? undefined,
  after: row.after ?? undefined,
  correlationId: row.correlationId ?? undefined,
  at: row.at,
  expireAt: new Date(row.at.getTime() + auditRetentionDays * DAY_MS),
});

const isDuplicateOnly = (err) =>
  Array.isArray(err.writeErrors) && err.writeErrors.length > 0 &&
  err.writeErrors.every((e) => (e.code ?? e.err?.code) === 11000);

// Moves outbox rows to MongoDB and deletes them from Postgres. Safe to run concurrently and repeatedly:
// the unique outboxId turns a re-insert into a no-op, and rows are deleted only after Mongo has them.
// Returns how many rows it moved (0 when Mongo is unavailable; the rows simply wait).
async function drain({ tenantId } = {}) {
  if (!mongo.ready()) return 0;
  const db = prisma.unscoped; // background work spans tenants; the extended client would refuse
  const rows = await db.auditOutbox.findMany({
    where: tenantId ? { tenantId } : {},
    orderBy: { id: 'asc' },
    take: BATCH,
  });
  if (!rows.length) return 0;
  const ids = rows.map((r) => r.id);

  try {
    await AuditEvent.ensureReady(); // the unique outboxId index must exist before inserting, or duplicates are possible
    await AuditEvent.insertMany(rows.map(toDocument), { ordered: false });
  } catch (err) {
    if (!isDuplicateOnly(err)) {
      await db.auditOutbox.updateMany({
        where: { id: { in: ids } },
        data: { attempts: { increment: 1 }, lastError: String(err.message).slice(0, 500) },
      });
      return 0;
    }
  }
  await db.auditOutbox.deleteMany({ where: { id: { in: ids } } });
  return rows.length;
}

// Drains until the outbox is empty (or Mongo stops accepting events).
async function drainAll() {
  let total = 0;
  for (;;) {
    const moved = await drain();
    total += moved;
    if (moved < BATCH) return total;
  }
}

// Periodic drain for the running server. Errors are swallowed: the next tick retries.
function startDrainWorker(intervalMs = 5000) {
  const timer = setInterval(() => { drainAll().catch(() => {}); }, intervalMs);
  timer.unref();
  drainAll().catch(() => {});
  return () => clearInterval(timer);
}

module.exports = { drain, drainAll, startDrainWorker };

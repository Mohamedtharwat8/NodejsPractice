const { HttpError } = require('../../middleware/error');
const { currentTenantId } = require('../../db/tenantContext');
const mongo = require('../../infra/mongo');
const AuditEvent = require('./audit.model');
const { drain } = require('./drain');

const encode = (event) => Buffer.from(`${event.at.getTime()}:${event._id}`).toString('base64url');

function decode(cursor) {
  const text = Buffer.from(cursor, 'base64url').toString();
  const match = /^(\d+):([a-f0-9]{24})$/.exec(text);
  if (!match) throw new HttpError(400, 'Invalid cursor', 'VALIDATION_ERROR');
  return { at: new Date(Number(match[1])), id: match[2] };
}

const view = (e) => ({
  id: String(e._id), at: e.at, actorId: e.actorId ?? null, action: e.action, entity: e.entity,
  entityId: e.entityId, before: e.before ?? null, after: e.after ?? null, correlationId: e.correlationId ?? null,
});

// Newest first. Always filtered by the caller's tenant: like the Prisma extension, this fails closed.
async function list({ entity, entityId, actorId, action, from, to, pageSize, cursor }) {
  const tenantId = currentTenantId();
  if (!tenantId) throw new Error('No tenant context for audit query');
  if (!mongo.ready()) throw new HttpError(503, 'Audit store is unavailable', 'SERVICE_UNAVAILABLE');

  await drain({ tenantId }).catch(() => {}); // read-your-writes: pick up events still in the outbox

  const and = [{ tenantId }];
  if (entity) and.push({ entity });
  if (entityId) and.push({ entityId });
  if (actorId) and.push({ actorId });
  if (action) and.push({ action });
  if (from) and.push({ at: { $gte: from } });
  if (to) and.push({ at: { $lte: to } });
  if (cursor) {
    const c = decode(cursor);
    and.push({ $or: [{ at: { $lt: c.at } }, { at: c.at, _id: { $lt: c.id } }] });
  }

  const rows = await AuditEvent.find({ $and: and }).sort({ at: -1, _id: -1 }).limit(pageSize + 1).lean();
  const data = rows.slice(0, pageSize);
  return { data: data.map(view), nextCursor: rows.length > pageSize ? encode(data.at(-1)) : null, pageSize };
}

module.exports = { list };

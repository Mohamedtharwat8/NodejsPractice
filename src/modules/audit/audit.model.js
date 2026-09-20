const mongoose = require('mongoose');

// Append-only: nothing in the application updates or deletes these documents except the TTL index.
const schema = new mongoose.Schema(
  {
    outboxId: { type: Number, required: true }, // id of the Postgres outbox row; makes draining idempotent
    tenantId: { type: Number, required: true },
    actorId: Number,
    action: { type: String, required: true },
    entity: { type: String, required: true },
    entityId: { type: Number, required: true },
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed,
    correlationId: String,
    at: { type: Date, required: true },
    expireAt: { type: Date, required: true }, // at + retention; MongoDB deletes the document then
  },
  // Indexes are created explicitly (ensureReady) once Mongo is reachable; automatic creation runs at
  // import time, before the connection exists, and would fail silently.
  { versionKey: false, minimize: false, autoIndex: false, autoCreate: false },
);

schema.index({ outboxId: 1 }, { unique: true });
schema.index({ tenantId: 1, entity: 1, entityId: 1, at: -1 });
schema.index({ tenantId: 1, actorId: 1, at: -1 });
schema.index({ tenantId: 1, at: -1 });
schema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

const AuditEvent = mongoose.models.AuditEvent || mongoose.model('AuditEvent', schema, 'audit_events');

// Creates the collection's indexes once per process; retried on the next call if Mongo was unreachable.
// Draining awaits this first: the unique outboxId index is what makes re-delivery idempotent.
let indexes = null;
AuditEvent.ensureReady = () => {
  indexes ||= AuditEvent.createIndexes().catch((err) => { indexes = null; throw err; });
  return indexes;
};

module.exports = AuditEvent;

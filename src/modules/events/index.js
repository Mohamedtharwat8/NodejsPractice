const prisma = require('../../db/prisma');
const { currentRequestId } = require('../../infra/requestContext');

// Event types and the jobs each one produces. Adding a type means adding it here and a handler in ./handlers.js.
const JOBS = {
  REQUEST_SUBMITTED: ['notify'], // tell approvers
  REQUEST_DECIDED: ['notify'], // tell the requester
  PO_ISSUED: ['notify', 'webhook'], // tell the requester, call the tenant's webhook
  PO_CANCELLED: ['webhook'],
};

const plain = (value) => JSON.parse(JSON.stringify(value));

// Records a domain event in the Postgres outbox. Pass the transaction client as `db` so the event commits
// with the change that caused it; a relay then publishes it to the job queue (see ./relay.js).
// Nothing is sent to Redis here, which is why this can never fail because of Redis.
const emit = (type, payload, db = prisma) => {
  if (!JOBS[type]) throw new Error(`Unknown event type ${type}`);
  return db.eventOutbox.create({ data: { type, payload: plain(payload), correlationId: currentRequestId() } });
};

// Asks the relay to publish now instead of waiting for its next tick. Never throws, never awaited.
const kick = () => { setImmediate(() => require('./relay').relay().catch(() => {})); };

module.exports = { emit, kick, JOBS };

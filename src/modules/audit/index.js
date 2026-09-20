const prisma = require('../../db/prisma');
const { currentRequestId } = require('../../infra/requestContext');

// Snapshots go into a JSON column: drop Decimals, Dates and undefined keys the way JSON.stringify does.
const plain = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

// Records an audit event in the Postgres outbox. Pass the transaction client as `db` so the event
// commits or rolls back together with the change it describes; a background drain then moves it to
// MongoDB (see ./drain.js). `changes` may carry `before` / `after` snapshots.
const audit = (actorId, action, entity, entityId, db = prisma, changes = {}) =>
  db.auditOutbox.create({
    data: {
      actorId, action, entity, entityId,
      before: plain(changes.before),
      after: plain(changes.after),
      correlationId: currentRequestId(),
    },
  });

module.exports = audit;

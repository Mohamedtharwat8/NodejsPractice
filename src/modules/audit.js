const prisma = require('../db/prisma');

// Pass a transaction client as `db` to log inside the same transaction.
const audit = (actorId, action, entity, entityId, db = prisma) =>
  db.auditLog.create({ data: { actorId, action, entity, entityId } });

module.exports = audit;

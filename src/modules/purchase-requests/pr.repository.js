const prisma = require('../../db/prisma');

const include = { items: true, approval: true, order: true };

// Writes take an optional transaction client so the service can commit them with their audit event.
const create = (data, db = prisma) => db.purchaseRequest.create({ data, include });
const findById = (id, db = prisma) => db.purchaseRequest.findUnique({ where: { id }, include });
const update = (id, data, db = prisma) => db.purchaseRequest.update({ where: { id }, data, include });

// Relations load with Prisma's default strategy: one extra query per relation for the whole page
// (never per row), each using an IN list. The 'join' strategy was tried and rejected, see docs/performance.md.
const findPage = ({ where, skip, take }) =>
  prisma.purchaseRequest.findMany({ where, include, skip, take, orderBy: { id: 'desc' } });
const count = (where) => prisma.purchaseRequest.count({ where });

// Conditional status change; returns true if the row was in `from` and is now in `to`.
async function transition(db, id, from, to) {
  const { count } = await db.purchaseRequest.updateMany({ where: { id, status: from }, data: { status: to } });
  return count === 1;
}

const createApproval = (db, data) => db.approval.create({ data });

module.exports = { create, findById, update, findPage, count, transition, createApproval };

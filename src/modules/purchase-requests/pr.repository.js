const prisma = require('../../db/prisma');

const include = { items: true, approval: true, order: true };

const create = (data) => prisma.purchaseRequest.create({ data, include });
const findById = (id, db = prisma) => db.purchaseRequest.findUnique({ where: { id }, include });
const update = (id, data) => prisma.purchaseRequest.update({ where: { id }, data, include });

const list = ({ where, skip, take }) =>
  Promise.all([
    prisma.purchaseRequest.findMany({ where, include, skip, take, orderBy: { id: 'desc' } }),
    prisma.purchaseRequest.count({ where }),
  ]);

// Conditional status change; returns true if the row was in `from` and is now in `to`.
async function transition(db, id, from, to) {
  const { count } = await db.purchaseRequest.updateMany({ where: { id, status: from }, data: { status: to } });
  return count === 1;
}

const createApproval = (db, data) => db.approval.create({ data });

module.exports = { create, findById, update, list, transition, createApproval };

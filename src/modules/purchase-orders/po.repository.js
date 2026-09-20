const prisma = require('../../db/prisma');

const include = { vendor: true, pr: { include: { items: true } } };

const findRequest = (db, id) => db.purchaseRequest.findUnique({ where: { id }, include: { order: true } });
const findVendor = (db, id) => db.vendor.findUnique({ where: { id } });
const countForYear = (db, year) => db.purchaseOrder.count({ where: { poNumber: { startsWith: `PO-${year}-` } } });
const create = (db, data) => db.purchaseOrder.create({ data, include });
const findById = (id) => prisma.purchaseOrder.findUniqueOrThrow({ where: { id }, include });

const findPage = ({ where, skip, take }) =>
  prisma.purchaseOrder.findMany({ where, include, skip, take, orderBy: { id: 'desc' } });
const count = (where) => prisma.purchaseOrder.count({ where });

// Returns true if the order was ISSUED and is now CANCELLED.
async function cancelIfIssued(id) {
  const { count } = await prisma.purchaseOrder.updateMany({
    where: { id, status: 'ISSUED' },
    data: { status: 'CANCELLED' },
  });
  return count === 1;
}

module.exports = { findRequest, findVendor, countForYear, create, findById, findPage, count, cancelIfIssued };

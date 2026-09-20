const prisma = require('../../db/prisma');
const { currentTenantId } = require('../../db/tenantContext');

const include = { vendor: true, pr: { include: { items: true } } };

const findRequest = (db, id) => db.purchaseRequest.findUnique({ where: { id }, include: { order: true } });
const findVendor = (db, id) => db.vendor.findUnique({ where: { id } });
// Serialises PO numbering per tenant and year until the transaction ends. Without it two concurrent
// issues both count N rows, both pick N+1, and one fails on the unique (tenantId, poNumber) constraint.
// The lock touches no table, so it sits outside the tenant extension by design.
const lockNumbering = (db, year) =>
  db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`po-number:${currentTenantId()}:${year}`}, 0))`;
const countForYear = (db, year) => db.purchaseOrder.count({ where: { poNumber: { startsWith: `PO-${year}-` } } });
const create = (db, data) => db.purchaseOrder.create({ data, include });
const findById = (id, db = prisma) => db.purchaseOrder.findUniqueOrThrow({ where: { id }, include });

const findPage = ({ where, skip, take }) =>
  prisma.purchaseOrder.findMany({ where, include, skip, take, orderBy: { id: 'desc' } });
const count = (where) => prisma.purchaseOrder.count({ where });

// Returns true if the order was ISSUED and is now CANCELLED.
async function cancelIfIssued(id, db = prisma) {
  const { count } = await db.purchaseOrder.updateMany({
    where: { id, status: 'ISSUED' },
    data: { status: 'CANCELLED' },
  });
  return count === 1;
}

module.exports = { findRequest, findVendor, lockNumbering, countForYear, create, findById, findPage, count, cancelIfIssued };

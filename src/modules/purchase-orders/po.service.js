const prisma = require('../../db/prisma');
const { HttpError } = require('../../middleware/error');
const audit = require('../audit');
const repo = require('./po.repository');
const prCache = require('../purchase-requests/pr.cache');
const events = require('../events');
const { paginate } = require('../../lib/pagination');

async function create(actorId, { prId, vendorId }) {
  const created = await prisma.$transaction(async (tx) => {
    const pr = await repo.findRequest(tx, prId);
    if (!pr) throw new HttpError(404, 'Purchase request not found');
    if (pr.status !== 'APPROVED') throw new HttpError(409, 'Request must be APPROVED');
    if (pr.order) throw new HttpError(409, 'Purchase order already exists for this request'); // BR6

    const vendor = await repo.findVendor(tx, vendorId);
    if (!vendor) throw new HttpError(404, 'Vendor not found');
    if (vendor.status !== 'ACTIVE') throw new HttpError(409, 'Vendor is not active');

    const year = new Date().getFullYear();
    const seq = (await repo.countForYear(tx, year)) + 1; // BR7
    const po = await repo.create(tx, { prId, vendorId, poNumber: `PO-${year}-${String(seq).padStart(4, '0')}` });
    await audit(actorId, 'CREATE', 'PurchaseOrder', po.id, tx, {
      after: { poNumber: po.poNumber, prId, vendorId, status: po.status },
    });
    await events.emit('PO_ISSUED', {
      poId: po.id, poNumber: po.poNumber, prId, vendorId, title: pr.title, requesterId: pr.requesterId,
    }, tx);
    return po;
  });
  await prCache.invalidate(prId); // the cached request embeds its order
  events.kick();
  return created;
}

async function list({ status, page, pageSize, cursor }) {
  const where = status ? { status } : {};
  return paginate({ where, page, pageSize, cursor, fetch: repo.findPage, count: repo.count });
}

const get = (id) => repo.findById(id);

async function cancel(actorId, id) {
  const po = await prisma.$transaction(async (tx) => {
    if (!(await repo.cancelIfIssued(id, tx))) throw new HttpError(409, 'Order not found or not ISSUED');
    await audit(actorId, 'CANCEL', 'PurchaseOrder', id, tx, { before: { status: 'ISSUED' }, after: { status: 'CANCELLED' } });
    const cancelled = await repo.findById(id, tx);
    await events.emit('PO_CANCELLED', { poId: id, poNumber: cancelled.poNumber, prId: cancelled.prId }, tx);
    return cancelled;
  });
  await prCache.invalidate(po.prId);
  events.kick();
  return po;
}

module.exports = { create, list, get, cancel };

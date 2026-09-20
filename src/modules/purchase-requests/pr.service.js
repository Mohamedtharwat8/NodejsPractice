const prisma = require('../../db/prisma');
const { HttpError } = require('../../middleware/error');
const audit = require('../audit');
const repo = require('./pr.repository');

const total = (items) => items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
const seesAll = (role) => role !== 'REQUESTER';

// Requesters only see their own requests; others get 404, not 403, to avoid leaking existence.
async function getVisible(user, id) {
  const pr = await repo.findById(id);
  if (!pr || (!seesAll(user.role) && pr.requesterId !== user.id)) throw new HttpError(404, 'Not found');
  return pr;
}

// The owner may act on a request only while it is in `status` (BR3).
async function getOwned(user, id, status) {
  const pr = await getVisible(user, id);
  if (pr.requesterId !== user.id) throw new HttpError(403, 'Only the owner can do this');
  if (pr.status !== status) throw new HttpError(409, `Request must be ${status}`);
  return pr;
}

async function create(user, { items, ...rest }) {
  const pr = await repo.create({
    ...rest,
    requesterId: user.id,
    totalAmount: total(items),
    items: { create: items },
  });
  await audit(user.id, 'CREATE', 'PurchaseRequest', pr.id);
  return pr;
}

async function list(user, { status, page, pageSize }) {
  const where = {
    ...(status && { status }),
    ...(!seesAll(user.role) && { requesterId: user.id }),
  };
  const [data, count] = await repo.list({ where, skip: (page - 1) * pageSize, take: pageSize });
  return { data, total: count, page, pageSize };
}

const get = (user, id) => getVisible(user, id);

async function update(user, id, { items, ...rest }) {
  await getOwned(user, id, 'DRAFT');
  const pr = await repo.update(id, {
    ...rest,
    ...(items && { totalAmount: total(items), items: { deleteMany: {}, create: items } }),
  });
  await audit(user.id, 'UPDATE', 'PurchaseRequest', id);
  return pr;
}

async function submit(user, id) {
  await getOwned(user, id, 'DRAFT');
  const pr = await repo.update(id, { status: 'SUBMITTED' });
  await audit(user.id, 'SUBMIT', 'PurchaseRequest', id);
  return pr;
}

// decision is 'APPROVED' or 'REJECTED'. Status change, approval row and audit commit together.
async function decide(user, id, decision, comment) {
  const existing = await getVisible(user, id);
  if (existing.requesterId === user.id) throw new HttpError(403, 'Cannot decide your own request'); // BR4
  return prisma.$transaction(async (tx) => {
    // The conditional transition guards against two approvers deciding at once (BR5).
    if (!(await repo.transition(tx, id, 'SUBMITTED', decision))) {
      throw new HttpError(409, 'Request must be SUBMITTED');
    }
    await repo.createApproval(tx, { prId: id, approverId: user.id, decision, comment });
    await audit(user.id, decision, 'PurchaseRequest', id, tx);
    return repo.findById(id, tx);
  });
}

module.exports = { create, list, get, update, submit, decide };

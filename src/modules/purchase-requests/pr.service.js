const prisma = require('../../db/prisma');
const { HttpError } = require('../../middleware/error');
const audit = require('../audit');
const repo = require('./pr.repository');
const prCache = require('./pr.cache');
const events = require('../events');
const { paginate } = require('../../lib/pagination');

const total = (items) => items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
const seesAll = (role) => role !== 'REQUESTER';

// Requesters only see their own requests; others get 404, not 403, to avoid leaking existence.
function assertVisible(user, pr) {
  if (!pr || (!seesAll(user.role) && pr.requesterId !== user.id)) throw new HttpError(404, 'Not found');
  return pr;
}

// Always reads the database: used before changing state, where a stale copy could break BR3-BR5.
async function getVisible(user, id) {
  return assertVisible(user, await repo.findById(id));
}

// The owner may act on a request only while it is in `status` (BR3).
async function getOwned(user, id, status) {
  const pr = await getVisible(user, id);
  if (pr.requesterId !== user.id) throw new HttpError(403, 'Only the owner can do this');
  if (pr.status !== status) throw new HttpError(409, `Request must be ${status}`);
  return pr;
}

// What the audit trail records about a request: the fields a reviewer cares about, not the whole row.
const snapshot = (pr) => ({
  title: pr.title, justification: pr.justification, status: pr.status,
  totalAmount: pr.totalAmount, itemCount: pr.items?.length,
});

// Each write and its audit event commit in one transaction; the cache is invalidated after the commit.
async function create(user, { items, ...rest }) {
  return prisma.$transaction(async (tx) => {
    const pr = await repo.create({
      ...rest,
      requesterId: user.id,
      totalAmount: total(items),
      items: { create: items },
    }, tx);
    await audit(user.id, 'CREATE', 'PurchaseRequest', pr.id, tx, { after: snapshot(pr) });
    return pr;
  });
}

async function list(user, { status, page, pageSize, cursor }) {
  const where = {
    ...(status && { status }),
    ...(!seesAll(user.role) && { requesterId: user.id }),
  };
  return paginate({ where, page, pageSize, cursor, fetch: repo.findPage, count: repo.count });
}

// The cache holds the request itself; visibility is checked per caller after the lookup.
async function get(user, id) {
  return assertVisible(user, await prCache.wrapDetail(id, () => repo.findById(id)));
}

async function update(user, id, { items, ...rest }) {
  const before = await getOwned(user, id, 'DRAFT');
  const pr = await prisma.$transaction(async (tx) => {
    const updated = await repo.update(id, {
      ...rest,
      ...(items && { totalAmount: total(items), items: { deleteMany: {}, create: items } }),
    }, tx);
    await audit(user.id, 'UPDATE', 'PurchaseRequest', id, tx, { before: snapshot(before), after: snapshot(updated) });
    return updated;
  });
  await prCache.invalidate(id);
  return pr;
}

async function submit(user, id) {
  await getOwned(user, id, 'DRAFT');
  const pr = await prisma.$transaction(async (tx) => {
    const updated = await repo.update(id, { status: 'SUBMITTED' }, tx);
    await audit(user.id, 'SUBMIT', 'PurchaseRequest', id, tx, {
      before: { status: 'DRAFT' }, after: { status: 'SUBMITTED', totalAmount: updated.totalAmount },
    });
    await events.emit('REQUEST_SUBMITTED', {
      prId: id, title: updated.title, requesterId: user.id, totalAmount: updated.totalAmount,
    }, tx);
    return updated;
  });
  await prCache.invalidate(id);
  events.kick();
  return pr;
}

// decision is 'APPROVED' or 'REJECTED'. Status change, approval row and audit commit together.
async function decide(user, id, decision, comment) {
  const existing = await getVisible(user, id);
  if (existing.requesterId === user.id) throw new HttpError(403, 'Cannot decide your own request'); // BR4
  const pr = await prisma.$transaction(async (tx) => {
    // The conditional transition guards against two approvers deciding at once (BR5).
    if (!(await repo.transition(tx, id, 'SUBMITTED', decision))) {
      throw new HttpError(409, 'Request must be SUBMITTED');
    }
    await repo.createApproval(tx, { prId: id, approverId: user.id, decision, comment });
    await audit(user.id, decision, 'PurchaseRequest', id, tx, {
      before: { status: 'SUBMITTED' }, after: { status: decision, comment: comment ?? null },
    });
    await events.emit('REQUEST_DECIDED', {
      prId: id, title: existing.title, requesterId: existing.requesterId, decision, comment: comment ?? null,
      approverId: user.id,
    }, tx);
    return repo.findById(id, tx);
  });
  await prCache.invalidate(id); // after commit, so a concurrent reader cannot re-cache the old state
  events.kick();
  return pr;
}

module.exports = { create, list, get, update, submit, decide };

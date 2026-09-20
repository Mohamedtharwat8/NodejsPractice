const prisma = require('../../db/prisma');
const repo = require('./vendors.repository');
const audit = require('../audit');
const cache = require('../../infra/cache');

// Vendor reads are cached per tenant; every write below invalidates. TTL bounds staleness if Redis
// misses an invalidation. Business rules (e.g. "vendor must be ACTIVE" for POs) never read the cache.
const TTL_SECONDS = 300;
const detailKey = (id) => cache.tenantKey('vendor', id);

async function list({ status, page, pageSize }) {
  const key = cache.tenantKey('vendors', 'list', await cache.version('vendors'), status ?? 'all', page, pageSize);
  return cache.wrap(key, TTL_SECONDS, async () => {
    const where = status ? { status } : {};
    const [data, total] = await repo.list({ where, skip: (page - 1) * pageSize, take: pageSize });
    return { data, total, page, pageSize };
  });
}

const get = (id) => cache.wrap(detailKey(id), TTL_SECONDS, () => repo.findById(id));

const invalidate = (id) => Promise.all([id && cache.del(detailKey(id)), cache.bump('vendors')]);

const snapshot = ({ name, email, phone, status }) => ({ name, email, phone, status });

// Each write and its audit event commit in one transaction; the cache is invalidated after the commit.
async function create(actorId, data) {
  const vendor = await prisma.$transaction(async (tx) => {
    const created = await repo.create(data, tx);
    await audit(actorId, 'CREATE', 'Vendor', created.id, tx, { after: snapshot(created) });
    return created;
  });
  await invalidate();
  return vendor;
}

async function update(actorId, id, data) {
  const vendor = await prisma.$transaction(async (tx) => {
    const before = await repo.findById(id, tx);
    const updated = await repo.update(id, data, tx);
    await audit(actorId, 'UPDATE', 'Vendor', id, tx, { before: snapshot(before), after: snapshot(updated) });
    return updated;
  });
  await invalidate(id);
  return vendor;
}

// Vendors are deactivated, never deleted (BR8).
async function deactivate(actorId, id) {
  const vendor = await prisma.$transaction(async (tx) => {
    const before = await repo.findById(id, tx);
    const updated = await repo.update(id, { status: 'INACTIVE' }, tx);
    await audit(actorId, 'DEACTIVATE', 'Vendor', id, tx, { before: snapshot(before), after: snapshot(updated) });
    return updated;
  });
  await invalidate(id);
  return vendor;
}

module.exports = { list, get, create, update, deactivate };

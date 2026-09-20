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

async function create(actorId, data) {
  const vendor = await repo.create(data);
  await audit(actorId, 'CREATE', 'Vendor', vendor.id);
  await invalidate();
  return vendor;
}

async function update(actorId, id, data) {
  const vendor = await repo.update(id, data);
  await audit(actorId, 'UPDATE', 'Vendor', id);
  await invalidate(id);
  return vendor;
}

// Vendors are deactivated, never deleted (BR8).
async function deactivate(actorId, id) {
  const vendor = await repo.update(id, { status: 'INACTIVE' });
  await audit(actorId, 'DEACTIVATE', 'Vendor', id);
  await invalidate(id);
  return vendor;
}

module.exports = { list, get, create, update, deactivate };

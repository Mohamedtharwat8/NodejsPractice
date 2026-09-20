const prisma = require('../../db/prisma');
const cache = require('../../infra/cache');

const TTL_SECONDS = 60;
const key = (id) => `tenant:status:${id}`; // global key: tenants are not tenant-scoped

// Checked on every authenticated request, so cached briefly. Returns 'ACTIVE', 'SUSPENDED' or null (unknown tenant).
const get = (tenantId) =>
  cache.wrap(key(tenantId), TTL_SECONDS, async () =>
    (await prisma.tenant.findUnique({ where: { id: tenantId }, select: { status: true } }))?.status ?? null);

// Call after changing a tenant's status so the change takes effect immediately.
const invalidate = (tenantId) => cache.del(key(tenantId));

module.exports = { get, invalidate };

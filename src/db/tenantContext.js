const { AsyncLocalStorage } = require('node:async_hooks');

// Holds { tenantId } for the current request. Set once by the auth middleware (or by
// tenant-aware code such as login); read by the Prisma extension in ./prisma.js.
const storage = new AsyncLocalStorage();

const runInTenant = (tenantId, fn) => storage.run({ tenantId }, fn);
const currentTenantId = () => storage.getStore()?.tenantId;

module.exports = { runInTenant, currentTenantId };

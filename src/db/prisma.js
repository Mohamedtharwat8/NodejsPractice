const { PrismaClient } = require('@prisma/client');
const { currentTenantId } = require('./tenantContext');

// Models that carry tenantId. PRItem and Approval are reached only through their
// PurchaseRequest; Tenant itself is global (platform-level).
const TENANT_MODELS = new Set(['User', 'Vendor', 'PurchaseRequest', 'PurchaseOrder', 'AuditLog']);

const FILTERED = new Set([
  'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany',
  'count', 'aggregate', 'groupBy', 'update', 'updateMany', 'delete', 'deleteMany',
]);

// Every query on a tenant model is scoped to the current tenant, and fails closed when
// there is none. Raw queries ($queryRaw / $executeRaw) bypass this: avoid them, or filter by hand.
const tenantIsolation = {
  name: 'tenant-isolation',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!TENANT_MODELS.has(model)) return query(args);

        const tenantId = currentTenantId();
        if (!tenantId) throw new Error(`No tenant context for ${model}.${operation}`);

        if (FILTERED.has(operation)) {
          args.where = { ...args.where, tenantId };
        } else if (operation === 'create') {
          args.data = { ...args.data, tenantId };
        } else if (operation === 'createMany' || operation === 'createManyAndReturn') {
          args.data = [].concat(args.data).map((row) => ({ ...row, tenantId }));
        } else if (operation === 'upsert') {
          args.where = { ...args.where, tenantId };
          args.create = { ...args.create, tenantId };
        } else {
          throw new Error(`Operation ${operation} is not allowed on ${model}`);
        }
        return query(args);
      },
    },
  },
};

module.exports = new PrismaClient().$extends(tenantIsolation);

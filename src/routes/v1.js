const router = require('express').Router();
const apiVersion = require('../middleware/apiVersion');

// Exposed so the contract test can compare the mounted routes with the OpenAPI spec.
const mounts = [
  ['/platform/tenants', require('../modules/tenants/tenants.routes')],
  ['/auth', require('../modules/auth/auth.routes')],
  ['/audit', require('../modules/audit/audit.routes')],
  ['/vendors', require('../modules/vendors/vendors.routes')],
  ['/purchase-requests', require('../modules/purchase-requests/pr.routes')],
  ['/purchase-orders', require('../modules/purchase-orders/po.routes')],
];

router.use(apiVersion('v1'));
for (const [prefix, sub] of mounts) router.use(prefix, sub);

router.mounts = mounts;
module.exports = router;

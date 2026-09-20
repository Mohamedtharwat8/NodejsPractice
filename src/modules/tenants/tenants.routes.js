const router = require('express').Router();
const bcrypt = require('bcryptjs');
const prisma = require('../../db/prisma');
const { runInTenant } = require('../../db/tenantContext');
const platformOnly = require('../../middleware/platformOnly');
const validate = require('../../middleware/validate');
const schema = require('./tenants.schema');
const tenantStatus = require('./tenant-status');
const audit = require('../audit');

router.use(platformOnly);

// Creates a tenant together with its first admin, atomically (FR17).
router.post('/', validate(schema.create), async (req, res) => {
  const { name, slug, admin } = req.body;
  const { password, ...adminData } = admin;
  const passwordHash = await bcrypt.hash(password, 10);

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({ data: { name, slug } });
    // Prisma queries are lazy: await inside the callback so the query runs within the tenant context.
    const user = await runInTenant(tenant.id, async () =>
      await tx.user.create({ data: { ...adminData, role: 'ADMIN', passwordHash } }),
    );
    await runInTenant(tenant.id, async () => {
      await audit(null, 'CREATE', 'Tenant', tenant.id, tx, { after: { name, slug } });
      await audit(null, 'CREATE', 'User', user.id, tx, { after: { email: user.email, role: user.role } });
    });
    return { tenant, admin: { id: user.id, name: user.name, email: user.email, role: user.role } };
  });
  res.status(201).json(result);
});

// Suspending blocks logins and every API call of the tenant at once (the status check is cached for
// at most 60s, and invalidated here). Reactivating reverses it.
router.patch('/:id/status', validate(schema.setStatus), async (req, res) => {
  const id = Number(req.params.id);
  const before = await prisma.tenant.findUniqueOrThrow({ where: { id } });
  const tenant = await prisma.tenant.update({ where: { id }, data: { status: req.body.status } });
  await runInTenant(id, async () => {
    await audit(null, 'SET_STATUS', 'Tenant', id, prisma, { before: { status: before.status }, after: { status: tenant.status } });
  });
  await tenantStatus.invalidate(id);
  res.json(tenant);
});

module.exports = router;

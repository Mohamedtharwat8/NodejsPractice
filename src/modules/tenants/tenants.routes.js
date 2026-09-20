const router = require('express').Router();
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../../db/prisma');
const { runInTenant } = require('../../db/tenantContext');
const { platformApiKey } = require('../../config/env');
const { HttpError } = require('../../middleware/error');
const validate = require('../../middleware/validate');
const schema = require('./tenants.schema');

// Platform-owner access: a shared secret, not a tenant user. Disabled unless PLATFORM_API_KEY is set.
function platformOnly(req, res, next) {
  if (!platformApiKey) throw new HttpError(404, 'Not found');
  const given = Buffer.from(String(req.headers['x-platform-key'] ?? ''));
  const expected = Buffer.from(platformApiKey);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    throw new HttpError(401, 'Invalid platform key');
  }
  next();
}

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
    return { tenant, admin: { id: user.id, name: user.name, email: user.email, role: user.role } };
  });
  res.status(201).json(result);
});

module.exports = router;

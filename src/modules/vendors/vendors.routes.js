const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../../db/prisma');
const { authenticate, requireRole } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const audit = require('../audit');

const vendorSchema = z.object({
  name: z.string().min(1),
  email: z.email().optional(),
  phone: z.string().optional(),
});
const updateSchema = vendorSchema.partial().extend({ status: z.enum(['ACTIVE', 'INACTIVE']).optional() });
const listSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const canWrite = requireRole('PROCUREMENT', 'ADMIN');
router.use(authenticate);

router.get('/', validate(listSchema, 'query'), async (req, res) => {
  const { status, page, pageSize } = req.validated.query;
  const where = status ? { status } : {};
  const [data, total] = await Promise.all([
    prisma.vendor.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { id: 'asc' } }),
    prisma.vendor.count({ where }),
  ]);
  res.json({ data, total, page, pageSize });
});

router.get('/:id', async (req, res) => {
  res.json(await prisma.vendor.findUniqueOrThrow({ where: { id: Number(req.params.id) } }));
});

router.post('/', canWrite, validate(vendorSchema), async (req, res) => {
  const vendor = await prisma.vendor.create({ data: req.body });
  await audit(Number(req.user.id), 'CREATE', 'Vendor', vendor.id);
  res.status(201).json(vendor);
});

router.patch('/:id', canWrite, validate(updateSchema), async (req, res) => {
  const vendor = await prisma.vendor.update({ where: { id: Number(req.params.id) }, data: req.body });
  await audit(Number(req.user.id), 'UPDATE', 'Vendor', vendor.id);
  res.json(vendor);
});

// Soft-deactivate rather than delete.
router.delete('/:id', canWrite, async (req, res) => {
  const vendor = await prisma.vendor.update({
    where: { id: Number(req.params.id) },
    data: { status: 'INACTIVE' },
  });
  await audit(Number(req.user.id), 'DEACTIVATE', 'Vendor', vendor.id);
  res.json(vendor);
});

module.exports = router;

const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../../db/prisma');
const { authenticate, requireRole } = require('../../middleware/auth');
const { HttpError } = require('../../middleware/error');
const validate = require('../../middleware/validate');
const audit = require('../audit');

const createSchema = z.object({ prId: z.number().int(), vendorId: z.number().int() });
const listSchema = z.object({
  status: z.enum(['ISSUED', 'CANCELLED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const include = { vendor: true, pr: { include: { items: true } } };

router.use(authenticate, requireRole('PROCUREMENT', 'ADMIN'));

router.post('/', validate(createSchema), async (req, res) => {
  const { prId, vendorId } = req.body;
  const po = await prisma.$transaction(async (tx) => {
    const pr = await tx.purchaseRequest.findUnique({ where: { id: prId }, include: { order: true } });
    if (!pr) throw new HttpError(404, 'Purchase request not found');
    if (pr.status !== 'APPROVED') throw new HttpError(409, 'Request must be APPROVED');
    if (pr.order) throw new HttpError(409, 'Purchase order already exists for this request');
    const vendor = await tx.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) throw new HttpError(404, 'Vendor not found');
    if (vendor.status !== 'ACTIVE') throw new HttpError(409, 'Vendor is not active');

    const year = new Date().getFullYear();
    const seq = (await tx.purchaseOrder.count({ where: { poNumber: { startsWith: `PO-${year}-` } } })) + 1;
    const created = await tx.purchaseOrder.create({
      data: { prId, vendorId, poNumber: `PO-${year}-${String(seq).padStart(4, '0')}` },
      include,
    });
    await audit(Number(req.user.id), 'CREATE', 'PurchaseOrder', created.id, tx);
    return created;
  });
  res.status(201).json(po);
});

router.get('/', validate(listSchema, 'query'), async (req, res) => {
  const { status, page, pageSize } = req.validated.query;
  const where = status ? { status } : {};
  const [data, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where, include, skip: (page - 1) * pageSize, take: pageSize, orderBy: { id: 'desc' },
    }),
    prisma.purchaseOrder.count({ where }),
  ]);
  res.json({ data, total, page, pageSize });
});

router.get('/:id', async (req, res) => {
  res.json(await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: Number(req.params.id) }, include }));
});

router.post('/:id/cancel', async (req, res) => {
  const { count } = await prisma.purchaseOrder.updateMany({
    where: { id: Number(req.params.id), status: 'ISSUED' },
    data: { status: 'CANCELLED' },
  });
  if (!count) throw new HttpError(409, 'Order not found or not ISSUED');
  await audit(Number(req.user.id), 'CANCEL', 'PurchaseOrder', Number(req.params.id));
  res.json(await prisma.purchaseOrder.findUnique({ where: { id: Number(req.params.id) }, include }));
});

module.exports = router;

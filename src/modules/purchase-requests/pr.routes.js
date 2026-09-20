const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../../db/prisma');
const { authenticate, requireRole } = require('../../middleware/auth');
const { HttpError } = require('../../middleware/error');
const validate = require('../../middleware/validate');
const audit = require('../audit');

const itemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().positive(),
});
const createSchema = z.object({
  title: z.string().min(1),
  justification: z.string().optional(),
  items: z.array(itemSchema).min(1),
});
const updateSchema = createSchema.partial();
const decisionSchema = z.object({ comment: z.string().optional() });
const listSchema = z.object({
  status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const include = { items: true, approvals: true, order: true };
const total = (items) => items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
const seesAll = (role) => role !== 'REQUESTER';

router.use(authenticate);

// Loads a PR and enforces visibility: requesters only see their own.
async function loadPR(req) {
  const pr = await prisma.purchaseRequest.findUnique({ where: { id: Number(req.params.id) }, include });
  if (!pr || (!seesAll(req.user.role) && pr.requesterId !== Number(req.user.id))) {
    throw new HttpError(404, 'Not found');
  }
  return pr;
}

// Loads a PR the caller owns (404 otherwise) that must be in `status`.
async function loadOwned(req, status) {
  const pr = await loadPR(req);
  if (pr.requesterId !== Number(req.user.id)) throw new HttpError(403, 'Only the owner can do this');
  if (pr.status !== status) throw new HttpError(409, `Request must be ${status}`);
  return pr;
}

router.post('/', validate(createSchema), async (req, res) => {
  const { items, ...rest } = req.body;
  const pr = await prisma.purchaseRequest.create({
    data: { ...rest, requesterId: Number(req.user.id), totalAmount: total(items), items: { create: items } },
    include,
  });
  await audit(Number(req.user.id), 'CREATE', 'PurchaseRequest', pr.id);
  res.status(201).json(pr);
});

router.get('/', validate(listSchema, 'query'), async (req, res) => {
  const { status, page, pageSize } = req.validated.query;
  const where = {
    ...(status && { status }),
    ...(!seesAll(req.user.role) && { requesterId: Number(req.user.id) }),
  };
  const [data, count] = await Promise.all([
    prisma.purchaseRequest.findMany({
      where, include, skip: (page - 1) * pageSize, take: pageSize, orderBy: { id: 'desc' },
    }),
    prisma.purchaseRequest.count({ where }),
  ]);
  res.json({ data, total: count, page, pageSize });
});

router.get('/:id', async (req, res) => res.json(await loadPR(req)));

router.patch('/:id', validate(updateSchema), async (req, res) => {
  await loadOwned(req, 'DRAFT');
  const { items, ...rest } = req.body;
  const pr = await prisma.purchaseRequest.update({
    where: { id: Number(req.params.id) },
    data: {
      ...rest,
      ...(items && { totalAmount: total(items), items: { deleteMany: {}, create: items } }),
    },
    include,
  });
  await audit(Number(req.user.id), 'UPDATE', 'PurchaseRequest', pr.id);
  res.json(pr);
});

router.post('/:id/submit', async (req, res) => {
  const existing = await loadOwned(req, 'DRAFT');
  const pr = await prisma.purchaseRequest.update({
    where: { id: existing.id },
    data: { status: 'SUBMITTED' },
    include,
  });
  await audit(Number(req.user.id), 'SUBMIT', 'PurchaseRequest', pr.id);
  res.json(pr);
});

const decide = (decision) => async (req, res) => {
  const existing = await loadPR(req);
  if (existing.requesterId === Number(req.user.id)) throw new HttpError(403, 'Cannot decide your own request');
  const status = decision;
  const pr = await prisma.$transaction(async (tx) => {
    // Conditional update guards against two approvers deciding at once.
    const { count } = await tx.purchaseRequest.updateMany({
      where: { id: existing.id, status: 'SUBMITTED' },
      data: { status },
    });
    if (!count) throw new HttpError(409, 'Request must be SUBMITTED');
    await tx.approval.create({
      data: { prId: existing.id, approverId: Number(req.user.id), decision, comment: req.body.comment },
    });
    await audit(Number(req.user.id), decision, 'PurchaseRequest', existing.id, tx);
    return tx.purchaseRequest.findUnique({ where: { id: existing.id }, include });
  });
  res.json(pr);
};

router.post('/:id/approve', requireRole('APPROVER', 'ADMIN'), validate(decisionSchema), decide('APPROVED'));
router.post('/:id/reject', requireRole('APPROVER', 'ADMIN'), validate(decisionSchema), decide('REJECTED'));

module.exports = router;

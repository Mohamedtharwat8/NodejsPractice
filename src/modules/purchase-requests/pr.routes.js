const router = require('express').Router();
const { z } = require('zod');
const { authenticate, requireRole } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const service = require('./pr.service');

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

const caller = (req) => ({ id: Number(req.user.id), role: req.user.role });
const id = (req) => Number(req.params.id);
const canDecide = requireRole('APPROVER', 'ADMIN');

router.use(authenticate);

router.post('/', validate(createSchema), async (req, res) => {
  res.status(201).json(await service.create(caller(req), req.body));
});
router.get('/', validate(listSchema, 'query'), async (req, res) => {
  res.json(await service.list(caller(req), req.validated.query));
});
router.get('/:id', async (req, res) => res.json(await service.get(caller(req), id(req))));
router.patch('/:id', validate(updateSchema), async (req, res) => {
  res.json(await service.update(caller(req), id(req), req.body));
});
router.post('/:id/submit', async (req, res) => res.json(await service.submit(caller(req), id(req))));
router.post('/:id/approve', canDecide, validate(decisionSchema), async (req, res) => {
  res.json(await service.decide(caller(req), id(req), 'APPROVED', req.body.comment));
});
router.post('/:id/reject', canDecide, validate(decisionSchema), async (req, res) => {
  res.json(await service.decide(caller(req), id(req), 'REJECTED', req.body.comment));
});

module.exports = router;

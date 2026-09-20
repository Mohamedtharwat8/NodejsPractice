const router = require('express').Router();
const { z } = require('zod');
const { authenticate, requireRole } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const service = require('./vendors.service');

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
const actorId = (req) => Number(req.user.id);
router.use(authenticate);

router.get('/', validate(listSchema, 'query'), async (req, res) => {
  res.json(await service.list(req.validated.query));
});
router.get('/:id', async (req, res) => res.json(await service.get(Number(req.params.id))));
router.post('/', canWrite, validate(vendorSchema), async (req, res) => {
  res.status(201).json(await service.create(actorId(req), req.body));
});
router.patch('/:id', canWrite, validate(updateSchema), async (req, res) => {
  res.json(await service.update(actorId(req), Number(req.params.id), req.body));
});
router.delete('/:id', canWrite, async (req, res) => {
  res.json(await service.deactivate(actorId(req), Number(req.params.id)));
});

module.exports = router;

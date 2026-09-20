const router = require('express').Router();
const { z } = require('zod');
const { authenticate, requireRole } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const service = require('./po.service');

const createSchema = z.object({ prId: z.number().int(), vendorId: z.number().int() });
const listSchema = z.object({
  status: z.enum(['ISSUED', 'CANCELLED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const actorId = (req) => Number(req.user.id);
const id = (req) => Number(req.params.id);

router.use(authenticate, requireRole('PROCUREMENT', 'ADMIN'));

router.post('/', validate(createSchema), async (req, res) => {
  res.status(201).json(await service.create(actorId(req), req.body));
});
router.get('/', validate(listSchema, 'query'), async (req, res) => {
  res.json(await service.list(req.validated.query));
});
router.get('/:id', async (req, res) => res.json(await service.get(id(req))));
router.post('/:id/cancel', async (req, res) => res.json(await service.cancel(actorId(req), id(req))));

module.exports = router;

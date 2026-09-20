const router = require('express').Router();
const { authenticate, requireRole } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const service = require('./po.service');
const schema = require('./po.schema');

const actorId = (req) => Number(req.user.id);
const id = (req) => Number(req.params.id);

router.use(authenticate, requireRole('PROCUREMENT', 'ADMIN'));

router.post('/', validate(schema.create), async (req, res) => {
  res.status(201).json(await service.create(actorId(req), req.body));
});
router.get('/', validate(schema.list, 'query'), async (req, res) => {
  res.json(await service.list(req.validated.query));
});
router.get('/:id', async (req, res) => res.json(await service.get(id(req))));
router.post('/:id/cancel', async (req, res) => res.json(await service.cancel(actorId(req), id(req))));

module.exports = router;

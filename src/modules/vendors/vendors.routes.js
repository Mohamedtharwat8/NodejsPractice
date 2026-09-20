const router = require('express').Router();
const { authenticate, requireRole } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const service = require('./vendors.service');
const schema = require('./vendors.schema');

const canWrite = requireRole('PROCUREMENT', 'ADMIN');
const actorId = (req) => Number(req.user.id);
router.use(authenticate);

router.get('/', validate(schema.list, 'query'), async (req, res) => {
  res.json(await service.list(req.validated.query));
});
router.get('/:id', async (req, res) => res.json(await service.get(Number(req.params.id))));
router.post('/', canWrite, validate(schema.create), async (req, res) => {
  res.status(201).json(await service.create(actorId(req), req.body));
});
router.patch('/:id', canWrite, validate(schema.update), async (req, res) => {
  res.json(await service.update(actorId(req), Number(req.params.id), req.body));
});
router.delete('/:id', canWrite, async (req, res) => {
  res.json(await service.deactivate(actorId(req), Number(req.params.id)));
});

module.exports = router;

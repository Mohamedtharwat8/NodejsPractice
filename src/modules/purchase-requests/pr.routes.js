const router = require('express').Router();
const { authenticate, requireRole } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const service = require('./pr.service');
const schema = require('./pr.schema');

const caller = (req) => ({ id: Number(req.user.id), role: req.user.role });
const id = (req) => Number(req.params.id);
const canDecide = requireRole('APPROVER', 'ADMIN');

router.use(authenticate);

router.post('/', validate(schema.create), async (req, res) => {
  res.status(201).json(await service.create(caller(req), req.body));
});
router.get('/', validate(schema.list, 'query'), async (req, res) => {
  res.json(await service.list(caller(req), req.validated.query));
});
router.get('/:id', async (req, res) => res.json(await service.get(caller(req), id(req))));
router.patch('/:id', validate(schema.update), async (req, res) => {
  res.json(await service.update(caller(req), id(req), req.body));
});
router.post('/:id/submit', async (req, res) => res.json(await service.submit(caller(req), id(req))));
router.post('/:id/approve', canDecide, validate(schema.decision), async (req, res) => {
  res.json(await service.decide(caller(req), id(req), 'APPROVED', req.body.comment));
});
router.post('/:id/reject', canDecide, validate(schema.decision), async (req, res) => {
  res.json(await service.decide(caller(req), id(req), 'REJECTED', req.body.comment));
});

module.exports = router;

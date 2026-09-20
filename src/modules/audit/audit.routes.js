const router = require('express').Router();
const { authenticate, requireRole } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const service = require('./audit.service');
const schema = require('./audit.schema');

router.use(authenticate, requireRole('ADMIN'));

router.get('/', validate(schema.list, 'query'), async (req, res) => {
  res.json(await service.list(req.validated.query));
});

module.exports = router;

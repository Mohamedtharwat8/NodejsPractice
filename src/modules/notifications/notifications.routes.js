const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const service = require('./notifications.service');
const schema = require('./notifications.schema');

const me = (req) => Number(req.user.id);

router.use(authenticate);

router.get('/', validate(schema.list, 'query'), async (req, res) => {
  res.json(await service.list(me(req), req.validated.query));
});
router.post('/read-all', async (req, res) => res.json(await service.markAllRead(me(req))));
router.post('/:id/read', async (req, res) => res.json(await service.markRead(me(req), Number(req.params.id))));

module.exports = router;

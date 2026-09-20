const router = require('express').Router();
const { authenticate, requireRole } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const service = require('./settings.service');
const schema = require('./settings.schema');

router.use(authenticate, requireRole('ADMIN'));

router.get('/webhook', async (req, res) => res.json(await service.getWebhook(req.user.tenantId)));
router.put('/webhook', validate(schema.webhook), async (req, res) => {
  res.json(await service.setWebhook(req.user, req.body));
});

module.exports = router;

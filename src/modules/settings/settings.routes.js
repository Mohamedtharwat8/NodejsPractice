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

router.get('/approval', async (req, res) => res.json(await service.getApproval(req.user.tenantId)));
router.put('/approval', validate(schema.approval), async (req, res) => {
  res.json(await service.setApproval(req.user, req.body));
});
router.put('/approval/users/:id', validate(schema.userLimit), async (req, res) => {
  res.json(await service.setUserLimit(req.user, Number(req.params.id), req.body));
});

module.exports = router;

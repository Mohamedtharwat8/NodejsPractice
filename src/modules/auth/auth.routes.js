const router = require('express').Router();
const { authenticate, requireRole } = require('../../middleware/auth');
const loginLimiter = require('../../middleware/loginLimiter');
const validate = require('../../middleware/validate');
const service = require('./auth.service');
const schema = require('./auth.schema');

router.post('/login', loginLimiter, validate(schema.login), async (req, res) => {
  res.json(await service.login(req.body));
});

router.post('/logout', authenticate, async (req, res) => {
  await service.logout(req.user);
  res.status(204).end();
});

// Only admins can create users (any role).
router.post('/register', authenticate, requireRole('ADMIN'), validate(schema.register), async (req, res) => {
  res.status(201).json(await service.register(req.body));
});

router.get('/me', authenticate, async (req, res) => {
  res.json(await service.me(Number(req.user.id)));
});

module.exports = router;

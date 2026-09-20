const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { authenticate, requireRole } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const service = require('./auth.service');
const schema = require('./auth.schema');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 20,
});

router.post('/login', loginLimiter, validate(schema.login), async (req, res) => {
  res.json(await service.login(req.body));
});

// Only admins can create users (any role).
router.post('/register', authenticate, requireRole('ADMIN'), validate(schema.register), async (req, res) => {
  res.status(201).json(await service.register(req.body));
});

router.get('/me', authenticate, async (req, res) => {
  res.json(await service.me(Number(req.user.id)));
});

module.exports = router;

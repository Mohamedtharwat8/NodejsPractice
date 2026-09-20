const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { authenticate, requireRole } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const service = require('./auth.service');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 20,
});

const loginSchema = z.object({
  tenant: z.string().min(1), // tenant slug
  email: z.email(),
  password: z.string().min(1),
});
const registerSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  password: z.string().min(8),
  role: z.enum(['REQUESTER', 'APPROVER', 'PROCUREMENT', 'ADMIN']).default('REQUESTER'),
});

router.post('/login', loginLimiter, validate(loginSchema), async (req, res) => {
  res.json(await service.login(req.body));
});

// Only admins can create users (any role).
router.post('/register', authenticate, requireRole('ADMIN'), validate(registerSchema), async (req, res) => {
  res.status(201).json(await service.register(req.body));
});

router.get('/me', authenticate, async (req, res) => {
  res.json(await service.me(Number(req.user.id)));
});

module.exports = router;

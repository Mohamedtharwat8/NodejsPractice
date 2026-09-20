const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const prisma = require('../../db/prisma');
const { jwtSecret, jwtExpiresIn } = require('../../config/env');
const { authenticate, requireRole } = require('../../middleware/auth');
const { HttpError } = require('../../middleware/error');
const validate = require('../../middleware/validate');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 20,
});

const loginSchema = z.object({ email: z.email(), password: z.string().min(1) });
const registerSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  password: z.string().min(8),
  role: z.enum(['REQUESTER', 'APPROVER', 'PROCUREMENT', 'ADMIN']).default('REQUESTER'),
});

const publicUser = ({ passwordHash, ...user }) => user;

router.post('/login', loginLimiter, validate(loginSchema), async (req, res) => {
  const user = await prisma.user.findUnique({ where: { email: req.body.email } });
  const ok = user && (await bcrypt.compare(req.body.password, user.passwordHash));
  if (!ok) throw new HttpError(401, 'Invalid credentials');
  const token = jwt.sign({ role: user.role }, jwtSecret, {
    subject: String(user.id),
    expiresIn: jwtExpiresIn,
  });
  res.json({ token, user: publicUser(user) });
});

// Only admins can create users (any role).
router.post('/register', authenticate, requireRole('ADMIN'), validate(registerSchema), async (req, res) => {
  const { password, ...rest } = req.body;
  const user = await prisma.user.create({
    data: { ...rest, passwordHash: await bcrypt.hash(password, 10) },
  });
  res.status(201).json(publicUser(user));
});

router.get('/me', authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: Number(req.user.id) } });
  if (!user) throw new HttpError(401, 'User no longer exists');
  res.json(publicUser(user));
});

module.exports = router;

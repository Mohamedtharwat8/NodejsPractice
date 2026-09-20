const rateLimit = require('express-rate-limit');
const { client, ready } = require('../infra/redis');
const { loginRateLimit } = require('../config/env');
const { HttpError } = require('./error');

const WINDOW_SECONDS = 15 * 60;

const tooMany = () => new HttpError(429, 'Too many login attempts, try again later', 'RATE_LIMITED');

// Per-process fallback, used when Redis is disabled or unreachable.
const memory = rateLimit({
  windowMs: WINDOW_SECONDS * 1000,
  limit: loginRateLimit,
  handler: (req, res, next) => next(tooMany()),
});

// Fixed-window counter shared by all API instances. Falls back to the in-memory limiter on any Redis problem.
async function loginLimiter(req, res, next) {
  if (!ready()) return memory(req, res, next);
  let count;
  try {
    const key = `rl:login:${req.ip}`;
    const [[, incremented]] = await client.multi().incr(key).expire(key, WINDOW_SECONDS, 'NX').exec();
    count = incremented;
  } catch {
    return memory(req, res, next);
  }
  if (count > loginRateLimit) {
    res.set('Retry-After', String(WINDOW_SECONDS));
    return next(tooMany());
  }
  next();
}

module.exports = loginLimiter;

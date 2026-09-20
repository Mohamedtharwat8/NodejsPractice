require('dotenv').config({ quiet: true });

const required = ['DATABASE_URL', 'JWT_SECRET'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length && process.env.NODE_ENV !== 'test') {
  throw new Error(`Missing env vars: ${missing.join(', ')}`);
}

module.exports = {
  port: Number(process.env.PORT) || 3000,
  jwtSecret: process.env.JWT_SECRET || 'test-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  // Platform-owner key for /platform/* routes. Unset disables those routes.
  platformApiKey: process.env.PLATFORM_API_KEY,
  // Redis is optional: without it caching, revocation and shared rate limits are off (see infra/redis.js).
  redisUrl: process.env.REDIS_URL || undefined,
  loginRateLimit: Number(process.env.LOGIN_RATE_LIMIT) || (process.env.NODE_ENV === 'test' ? 1000 : 20),
};

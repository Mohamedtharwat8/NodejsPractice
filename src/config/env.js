require('dotenv').config({ quiet: true });

const required = ['DATABASE_URL', 'JWT_SECRET'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length && process.env.NODE_ENV !== 'test') {
  throw new Error(`Missing env vars: ${missing.join(', ')}`);
}

// A placeholder or short signing secret in production would let anyone mint tokens.
if (process.env.NODE_ENV === 'production') {
  const weak = (v) => !v || v.length < 16 || /change-?me/i.test(v);
  if (weak(process.env.JWT_SECRET)) throw new Error('JWT_SECRET must be at least 16 characters and not a placeholder in production');
  if (process.env.PLATFORM_API_KEY && weak(process.env.PLATFORM_API_KEY)) {
    throw new Error('PLATFORM_API_KEY must be at least 16 characters and not a placeholder in production');
  }
}

module.exports = {
  port: Number(process.env.PORT) || 3000,
  jwtSecret: process.env.JWT_SECRET || 'test-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  // Platform-owner key for /platform/* routes. Unset disables those routes.
  platformApiKey: process.env.PLATFORM_API_KEY,
  // Redis is optional: without it caching, revocation and shared rate limits are off (see infra/redis.js).
  redisUrl: process.env.REDIS_URL || undefined,
  // MongoDB stores audit events. Without it events accumulate in the Postgres outbox until it is configured.
  mongodbUrl: process.env.MONGODB_URL || undefined,
  auditRetentionDays: Number(process.env.AUDIT_RETENTION_DAYS) || 2555, // about 7 years
  // Notifications (phase 8). Email goes through SMTP_URL when set; otherwise messages are only logged.
  smtpUrl: process.env.SMTP_URL || undefined,
  mailFrom: process.env.MAIL_FROM || 'Procurement Portal <no-reply@procurement.local>',
  jobAttempts: Number(process.env.JOB_ATTEMPTS) || 5,
  jobBackoffMs: Number(process.env.JOB_BACKOFF_MS) || 2000, // doubles on every retry
  allowInsecureWebhooks: process.env.ALLOW_INSECURE_WEBHOOKS === '1', // http and private addresses, for tests/dev only
  // Browsers on other origins are refused unless listed (comma-separated). The bundled client is same-origin behind nginx.
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean),
  // Number of reverse proxies in front of the API, so rate limits see the real client address.
  trustProxy: Number(process.env.TRUST_PROXY) || 0,
  loginRateLimit: Number(process.env.LOGIN_RATE_LIMIT) || (process.env.NODE_ENV === 'test' ? 1000 : 20),
};

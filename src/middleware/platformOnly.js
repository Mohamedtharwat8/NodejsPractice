const crypto = require('node:crypto');
const { platformApiKey } = require('../config/env');
const { HttpError } = require('./error');

// Platform-owner access: a shared secret, not a tenant user. Disabled unless PLATFORM_API_KEY is set.
function platformOnly(req, res, next) {
  if (!platformApiKey) throw new HttpError(404, 'Not found');
  const given = Buffer.from(String(req.headers['x-platform-key'] ?? ''));
  const expected = Buffer.from(platformApiKey);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    throw new HttpError(401, 'Invalid platform key');
  }
  next();
}

module.exports = platformOnly;

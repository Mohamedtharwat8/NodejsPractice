const { client, ready } = require('./redis');

// Logged-out tokens, kept only until the token would have expired anyway.
// isRevoked fails open: if Redis is down, a revoked token keeps working until it expires (JWT_EXPIRES_IN).
const key = (jti) => `revoked:${jti}`;

async function isRevoked(jti) {
  if (!jti || !ready()) return false;
  try {
    return (await client.exists(key(jti))) === 1;
  } catch {
    return false;
  }
}

// Returns false when revocation could not be recorded, so logout can say so instead of pretending.
async function revoke(jti, expiresAtSeconds) {
  const ttl = Math.ceil(expiresAtSeconds - Date.now() / 1000);
  if (ttl <= 0) return true; // already expired
  if (!ready()) return false;
  try {
    await client.set(key(jti), '1', 'EX', ttl);
    return true;
  } catch {
    return false;
  }
}

module.exports = { isRevoked, revoke };

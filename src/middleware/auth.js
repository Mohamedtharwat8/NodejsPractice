const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/env');
const { HttpError } = require('./error');
const { runInTenant } = require('../db/tenantContext');
const { isRevoked } = require('../infra/revocation');
const tenantStatus = require('../modules/tenants/tenant-status');

async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'Missing token');
  let payload;
  try {
    payload = jwt.verify(token, jwtSecret);
  } catch {
    throw new HttpError(401, 'Invalid token');
  }
  if (!payload.tid) throw new HttpError(401, 'Invalid token'); // pre-tenancy token

  const [revoked, status] = await Promise.all([isRevoked(payload.jti), tenantStatus.get(payload.tid)]);
  if (revoked || !status) throw new HttpError(401, 'Invalid token');
  if (status !== 'ACTIVE') throw new HttpError(403, 'Tenant is suspended');

  req.user = { id: payload.sub, role: payload.role, tenantId: payload.tid, jti: payload.jti, exp: payload.exp };
  // Everything downstream (handlers, services, Prisma) runs inside this tenant's context.
  runInTenant(payload.tid, next);
}

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) throw new HttpError(403, 'Forbidden');
  next();
};

module.exports = { authenticate, requireRole };

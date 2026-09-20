const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/env');
const { HttpError } = require('./error');
const { runInTenant } = require('../db/tenantContext');

function authenticate(req, res, next) {
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
  req.user = { id: payload.sub, role: payload.role, tenantId: payload.tid };
  // Everything downstream (handlers, services, Prisma) runs inside this tenant's context.
  runInTenant(payload.tid, next);
}

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) throw new HttpError(403, 'Forbidden');
  next();
};

module.exports = { authenticate, requireRole };

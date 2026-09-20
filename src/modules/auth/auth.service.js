const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { revoke } = require('../../infra/revocation');
const { jwtSecret, jwtExpiresIn } = require('../../config/env');
const { HttpError } = require('../../middleware/error');
const { runInTenant } = require('../../db/tenantContext');
const repo = require('./auth.repository');

const publicUser = ({ passwordHash, ...user }) => user;

async function login({ tenant: slug, email, password }) {
  const tenant = await repo.findTenantBySlug(slug);
  if (!tenant) throw new HttpError(401, 'Invalid credentials');
  if (tenant.status !== 'ACTIVE') throw new HttpError(403, 'Tenant is suspended');

  return runInTenant(tenant.id, async () => {
    const user = await repo.findByEmail(email);
    const ok = user && (await bcrypt.compare(password, user.passwordHash));
    if (!ok) throw new HttpError(401, 'Invalid credentials');
    const token = jwt.sign({ role: user.role, tid: tenant.id }, jwtSecret, {
      subject: String(user.id),
      expiresIn: jwtExpiresIn,
      jwtid: crypto.randomUUID(), // lets logout revoke this one token
    });
    return { token, user: publicUser(user) };
  });
}

// Revokes the presented token until it would have expired. Needs Redis; says so when it is unavailable.
async function logout({ jti, exp }) {
  if (!(await revoke(jti, exp))) {
    throw new HttpError(503, 'Logout is temporarily unavailable', 'SERVICE_UNAVAILABLE');
  }
}

// Runs in the calling admin's tenant context, so the new user joins the admin's tenant.
async function register({ password, ...rest }) {
  const user = await repo.create({ ...rest, passwordHash: await bcrypt.hash(password, 10) });
  return publicUser(user);
}

async function me(id) {
  const user = await repo.findById(id);
  if (!user) throw new HttpError(401, 'User no longer exists');
  return publicUser(user);
}

module.exports = { login, logout, register, me };

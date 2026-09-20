const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { jwtSecret, jwtExpiresIn } = require('../../config/env');
const { HttpError } = require('../../middleware/error');
const repo = require('./auth.repository');

const publicUser = ({ passwordHash, ...user }) => user;

async function login({ email, password }) {
  const user = await repo.findByEmail(email);
  const ok = user && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) throw new HttpError(401, 'Invalid credentials');
  const token = jwt.sign({ role: user.role }, jwtSecret, {
    subject: String(user.id),
    expiresIn: jwtExpiresIn,
  });
  return { token, user: publicUser(user) };
}

async function register({ password, ...rest }) {
  const user = await repo.create({ ...rest, passwordHash: await bcrypt.hash(password, 10) });
  return publicUser(user);
}

async function me(id) {
  const user = await repo.findById(id);
  if (!user) throw new HttpError(401, 'User no longer exists');
  return publicUser(user);
}

module.exports = { login, register, me };

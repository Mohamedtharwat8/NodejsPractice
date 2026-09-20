const crypto = require('node:crypto');
const { runWithRequest } = require('../infra/requestContext');

// Accepts a caller's id (X-Request-Id) when it looks sane, otherwise generates one; echoes it back.
const VALID = /^[A-Za-z0-9._-]{8,64}$/;

function requestId(req, res, next) {
  const given = req.headers['x-request-id'];
  const id = typeof given === 'string' && VALID.test(given) ? given : crypto.randomUUID();
  req.id = id;
  res.set('X-Request-Id', id);
  runWithRequest({ requestId: id }, next);
}

module.exports = requestId;

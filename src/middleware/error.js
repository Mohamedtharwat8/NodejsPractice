const { ZodError } = require('zod');

// Stable machine-readable codes, so clients branch on `error.code`, not on message text.
const CODE_BY_STATUS = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
};

class HttpError extends Error {
  constructor(status, message, code = CODE_BY_STATUS[status] || 'ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const send = (res, status, code, message, details) =>
  res.status(status).json({ error: { code, message, ...(details && { details }) } });

function notFound(req, res) {
  send(res, 404, 'NOT_FOUND', 'Route not found');
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) return send(res, 400, 'VALIDATION_ERROR', 'Validation failed', err.issues);
  if (err.code === 'P2002') return send(res, 409, 'CONFLICT', 'Already exists');
  if (err.code === 'P2025') return send(res, 404, 'NOT_FOUND', 'Not found');
  if (err.type === 'entity.parse.failed') return send(res, 400, 'INVALID_JSON', 'Malformed JSON body');

  const status = err.status || 500;
  if (status === 500) {
    console.error(err);
    return send(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
  send(res, status, err.code || CODE_BY_STATUS[status] || 'ERROR', err.message);
}

module.exports = { HttpError, notFound, errorHandler };

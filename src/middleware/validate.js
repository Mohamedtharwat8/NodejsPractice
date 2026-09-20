// Parses req[source] with a zod schema and replaces it with the parsed value.
const validate = (schema, source = 'body') => (req, res, next) => {
  // Express 5 leaves req.body undefined when the request has no body.
  const parsed = schema.parse(req[source] ?? {});
  if (source === 'body') req.body = parsed;
  else req.validated = { ...req.validated, [source]: parsed };
  next();
};

module.exports = validate;

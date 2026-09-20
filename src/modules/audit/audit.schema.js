const { z } = require('zod');

// ISO 8601 ("2026-09-20T10:00:00Z"); kept as a string schema so the OpenAPI generator can describe it.
const timestamp = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

const list = z.object({
  entity: z.string().min(1).optional(),
  entityId: z.coerce.number().int().positive().optional(),
  actorId: z.coerce.number().int().positive().optional(),
  action: z.string().min(1).optional(),
  from: timestamp.optional(),
  to: timestamp.optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

module.exports = { list };

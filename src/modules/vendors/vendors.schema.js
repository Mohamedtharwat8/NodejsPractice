const { z } = require('zod');

const create = z.object({
  name: z.string().min(1),
  email: z.email().optional(),
  phone: z.string().optional(),
});

const update = create.partial().extend({ status: z.enum(['ACTIVE', 'INACTIVE']).optional() });

const list = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

module.exports = { create, update, list };

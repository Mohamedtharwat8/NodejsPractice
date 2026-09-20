const { z } = require('zod');

const create = z.object({ prId: z.number().int(), vendorId: z.number().int() });

const list = z.object({
  status: z.enum(['ISSUED', 'CANCELLED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

module.exports = { create, list };

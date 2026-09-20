const { z } = require('zod');
const { pagingFields } = require('../../lib/pagination');

const create = z.object({ prId: z.number().int(), vendorId: z.number().int() });

const list = z.object({
  status: z.enum(['ISSUED', 'CANCELLED']).optional(),
  ...pagingFields,
});

module.exports = { create, list };

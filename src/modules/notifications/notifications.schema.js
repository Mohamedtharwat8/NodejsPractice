const { z } = require('zod');
const { pagingFields } = require('../../lib/pagination');

const list = z.object({
  unread: z.enum(['true', 'false']).optional(),
  ...pagingFields,
});

module.exports = { list };

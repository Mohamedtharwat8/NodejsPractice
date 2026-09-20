const { z } = require('zod');

const create = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'lowercase letters, digits and hyphens'),
  admin: z.object({ name: z.string().min(1), email: z.email(), password: z.string().min(8) }),
});

module.exports = { create };

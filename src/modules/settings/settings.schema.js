const { z } = require('zod');

const webhook = z.object({
  url: z.url().nullable(), // null switches webhooks off
  rotateSecret: z.boolean().optional(),
});

module.exports = { webhook };

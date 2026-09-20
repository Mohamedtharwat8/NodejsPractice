const { z } = require('zod');

const webhook = z.object({
  url: z.url().nullable(), // null switches webhooks off
  rotateSecret: z.boolean().optional(),
});

const limit = z.number().nonnegative().max(9999999999.99).nullable(); // null clears it

const approval = z.object({ threshold: limit }); // requests above this need an approver limit (BR9)
const userLimit = z.object({ approvalLimit: limit });

module.exports = { webhook, approval, userLimit };

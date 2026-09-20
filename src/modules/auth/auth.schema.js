const { z } = require('zod');

const login = z.object({
  tenant: z.string().min(1), // tenant slug
  email: z.email(),
  password: z.string().min(1),
});

const register = z.object({
  name: z.string().min(1),
  email: z.email(),
  password: z.string().min(8),
  role: z.enum(['REQUESTER', 'APPROVER', 'PROCUREMENT', 'ADMIN']).default('REQUESTER'),
  approvalLimit: z.number().nonnegative().max(9999999999.99).nullable().optional(), // BR9
});

module.exports = { login, register };

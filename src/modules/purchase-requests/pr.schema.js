const { z } = require('zod');

const item = z.object({
  description: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().positive(),
});

const create = z.object({
  title: z.string().min(1),
  justification: z.string().optional(),
  items: z.array(item).min(1),
});

const update = create.partial();
const decision = z.object({ comment: z.string().optional() });

const list = z.object({
  status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

module.exports = { create, update, decision, list };

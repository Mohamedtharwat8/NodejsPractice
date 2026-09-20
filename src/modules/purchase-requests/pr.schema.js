const { z } = require('zod');
const { pagingFields } = require('../../lib/pagination');

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
  ...pagingFields,
});

module.exports = { create, update, decision, list };

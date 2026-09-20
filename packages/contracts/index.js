const { z } = require("zod");

const lineItem = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().nonnegative(),
});

const procurementContext = z.object({
  title: z.string().trim().min(1).max(200),
  requester: z.string().trim().max(200).optional(),
  items: z.array(lineItem).min(1).max(100),
});

const aiContracts = {
  draftJustification: procurementContext,
  vendorRecommendation: procurementContext,
  spendSummary: z.object({
    spend: z.array(z.object({
      category: z.string().trim().min(1).max(200),
      amount: z.coerce.number().nonnegative(),
    })).min(1).max(500),
  }),
};

const notificationJob = z.object({
  eventId: z.number().int().positive(),
  tenantId: z.number().int().positive(),
  type: z.enum(["REQUEST_SUBMITTED", "REQUEST_DECIDED", "PO_ISSUED", "PO_CANCELLED"]),
  payload: z.record(z.string(), z.unknown()),
  correlationId: z.string().optional().nullable(),
});

module.exports = { aiContracts, notificationJob, lineItem };

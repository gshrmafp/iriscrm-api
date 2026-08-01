import { z } from 'zod';

export const quotationLineInputSchema = z.object({
  catalogItemId: z.string().optional(),
  description: z.string().min(1),
  qty: z.coerce.number().positive(),
  unitPrice: z.coerce.number().nonnegative(),
  discount: z.coerce.number().nonnegative().default(0), // amount, not %
  taxRatePct: z.coerce.number().nonnegative().default(0),
});
export type QuotationLineInput = z.infer<typeof quotationLineInputSchema>;

export const createQuotationSchema = z.object({
  opportunityId: z.string().min(1),
  validTill: z.coerce.date().optional(),
  lines: z.array(quotationLineInputSchema).min(1),
});
export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;

export const reviseQuotationSchema = createQuotationSchema.omit({ opportunityId: true });
export type ReviseQuotationInput = z.infer<typeof reviseQuotationSchema>;

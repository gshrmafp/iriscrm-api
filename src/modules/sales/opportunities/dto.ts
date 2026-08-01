import { z } from 'zod';
import { DealType, OpportunityStage } from '@prisma/client';

export const transitionStageSchema = z.object({
  toStage: z.nativeEnum(OpportunityStage),
  remark: z.string().optional(),
});
export type TransitionStageInput = z.infer<typeof transitionStageSchema>;

export const reassignSchema = z.object({
  ownerId: z.string().min(1),
});
export type ReassignInput = z.infer<typeof reassignSchema>;

export const markLostSchema = z.object({
  reason: z.string().min(1),
});
export type MarkOppLostInput = z.infer<typeof markLostSchema>;

export const winSchema = z.object({
  // Installation hand-off
  site: z.string().optional(),
  bom: z.array(z.object({ catalogItemId: z.string(), qty: z.number().positive() })).optional(),
  timeline: z.string().optional(),
  customerId: z.string().optional(),
  // AMC hand-off
  amcType: z.enum(['COMPREHENSIVE', 'NON_COMPREHENSIVE']).optional(),
  amcFrequency: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL']).optional(),
  amcStartDate: z.coerce.date().optional(),
  amcEndDate: z.coerce.date().optional(),
});
export type WinInput = z.infer<typeof winSchema>;

// ---------- Listing with pagination + filters ----------

export const listOpportunitiesQuerySchema = z.object({
  stage: z.nativeEnum(OpportunityStage).optional(),
  dealType: z.nativeEnum(DealType).optional(),
  ownerId: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(200).optional().default(50),
  sortBy: z.enum(['createdAt', 'updatedAt', 'value', 'expectedClose']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});
export type ListOpportunitiesQuery = z.infer<typeof listOpportunitiesQuerySchema>;

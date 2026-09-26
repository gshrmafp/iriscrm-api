import { z } from 'zod';
import { DealType, OpportunityStage } from '@prisma/client';

// Fields needed to create an Opportunity from a qualified lead (Step 3 —
// REQUIREMENT_IDENTIFIED path). Not a request-body schema of its own; the
// actual validated input comes from leads/dto.ts's saveStep3Schema.
export interface CreateOpportunityInput {
  dealType: DealType | 'INSTALLATION' | 'AMC' | 'MAINTENANCE';
  value: number;
  expectedClose?: Date;
}

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
  // Purchase Order — required to close a deal as won
  poNumber: z.string().min(1, 'PO number is required'),
  poDate: z.coerce.date(),
  poAmount: z.coerce.number().positive('PO amount must be positive'),
  poRemarks: z.string().max(1000).optional(),
  poGpsLatitude: z.coerce.number().min(-90).max(90).optional(),
  poGpsLongitude: z.coerce.number().min(-180).max(180).optional(),
  poLocation: z.string().max(300).optional(),
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

export const pipelineSummaryQuerySchema = z.object({
  ownerId: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});
export type PipelineSummaryQuery = z.infer<typeof pipelineSummaryQuerySchema>;

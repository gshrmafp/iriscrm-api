import { z } from 'zod';
import { FollowUpPriority, LeadStatus, OpportunityStage } from '@prisma/client';

// Indian mobile numbers: 10 digits starting 6-9, with an optional +91/91/0 STD-style prefix.
const MOBILE_REGEX = /^(?:\+?91[-\s]?|0)?[6-9]\d{9}$/;

export const createLeadSchema = z.object({
  contactName: z.string().min(1, 'Contact name is required'),
  companyName: z.string().optional(),
  contactPhone: z
    .string()
    .regex(MOBILE_REGEX, 'Enter a valid 10-digit mobile number')
    .optional()
    .or(z.literal('')),
  contactEmail: z.string().email('Enter a valid email').optional().or(z.literal('')),
  address: z.string().max(500, 'Address must be under 500 characters').optional(),
  gpsLatitude: z.coerce.number().min(-90).max(90).optional(),
  gpsLongitude: z.coerce.number().min(-180).max(180).optional(),
  visitLocation: z.string().max(300).optional(),
  // Validated against active PicklistOption(LEAD_SOURCE/PRODUCT_INTEREST) codes
  // in the service layer, so this list stays admin-configurable at runtime.
  source: z.string().min(1, 'Source is required'),
  sourceOther: z.string().max(200, 'Must be under 200 characters').optional(),
  productInterest: z.string().optional(),
  productInterestOther: z.string().max(200, 'Must be under 200 characters').optional(),
  notes: z.string().max(400, 'Notes must be 400 characters or fewer').optional(),
  regionId: z.string().optional(), // Admin may override; defaults to creator's region (SM-1.4)
  ownerId: z.string().optional(), // defaults to creator
});
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const addFollowUpSchema = z.object({
  note: z.string().min(1),
  channel: z.enum(['call', 'meeting', 'email']),
  nextActionAt: z.coerce.date().optional(),
  priority: z.nativeEnum(FollowUpPriority).optional(),
});
export type AddFollowUpInput = z.infer<typeof addFollowUpSchema>;

export const markLostSchema = z.object({
  reason: z.enum(['price', 'competitor', 'no_budget', 'no_response', 'other']),
});
export type MarkLostInput = z.infer<typeof markLostSchema>;

export const qualifyLeadSchema = z.object({
  dealType: z.enum(['INSTALLATION', 'AMC', 'PRODUCT', 'MAINTENANCE']),
  value: z.coerce.number().positive(),
  expectedClose: z.coerce.date().optional(),
});
export type QualifyLeadInput = z.infer<typeof qualifyLeadSchema>;

// ---------- Listing with pagination + filters ----------

export const listLeadsQuerySchema = z.object({
  status: z.nativeEnum(LeadStatus).optional(),
  // Filters by the linked Opportunity's stage instead of the Lead's own
  // status — "Quoted" (and other post-qualification stages) live on
  // Opportunity, not Lead, since a Lead converts into an Opportunity once
  // qualified. Mutually exclusive with `status` in practice (a lead with an
  // opportunity is already QUALIFIED), but both are applied if both are sent.
  opportunityStage: z.nativeEnum(OpportunityStage).optional(),
  source: z.string().optional(),
  productInterest: z.string().optional(),
  ownerId: z.string().optional(),
  search: z.string().optional(), // matches contactName / companyName / contactPhone / contactEmail
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(200).optional().default(50),
  sortBy: z.enum(['createdAt', 'updatedAt', 'contactName']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});
export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;

export const leadStatusSummaryQuerySchema = z.object({
  ownerId: z.string().optional(),
});
export type LeadStatusSummaryQuery = z.infer<typeof leadStatusSummaryQuerySchema>;

// ---------- Follow-ups aggregate (across leads, for an Activities-style view) ----------

export const listLeadFollowUpsQuerySchema = z.object({
  ownerId: z.string().optional(),
  completed: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(200).optional().default(50),
});
export type ListLeadFollowUpsQuery = z.infer<typeof listLeadFollowUpsQuerySchema>;

// ---------- Stepped lead creation (3-step wizard) ----------

export const saveStep1Schema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  remarks: z.string().max(1000).optional(),
  gpsLatitude: z.coerce.number().min(-90).max(90).optional(),
  gpsLongitude: z.coerce.number().min(-180).max(180).optional(),
  visitLocation: z.string().max(300).optional(),
});
export type SaveStep1Input = z.infer<typeof saveStep1Schema>;

export const saveStep2Schema = z
  .object({
    contactName: z.string().min(1, 'Customer name is required'),
    contactPhone: z
      .string()
      .regex(MOBILE_REGEX, 'Enter a valid 10-digit mobile number')
      .optional()
      .or(z.literal('')),
    contactEmail: z.string().email('Enter a valid email').optional().or(z.literal('')),
    discussionNote: z.string().max(1000).optional(),
  })
  .refine((data) => !!data.contactPhone?.trim() || !!data.contactEmail?.trim(), {
    message: 'At least one of phone or email is required',
    path: ['contactPhone'],
  });
export type SaveStep2Input = z.infer<typeof saveStep2Schema>;

export const saveStep3Schema = z.discriminatedUnion('path', [
  z.object({
    path: z.literal('NOT_QUALIFIED'),
    remark: z.string().min(1, 'Remark is required'),
  }),
  z.object({
    path: z.literal('FUTURE_POTENTIAL'),
    followUpDate: z.coerce.date(),
    remarks: z.string().max(1000).optional(),
  }),
  z.object({
    path: z.literal('REQUIREMENT_IDENTIFIED'),
    dealType: z.enum(['INSTALLATION', 'AMC', 'MAINTENANCE']),
    quotationRef: z.string().min(1, 'Quotation number is required'),
    quotationDate: z.coerce.date(),
    quotationAmount: z.coerce.number().positive('Amount must be positive'),
  }),
]);
export type SaveStep3Input = z.infer<typeof saveStep3Schema>;

import { z } from 'zod';
import { LeadStatus } from '@prisma/client';

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
});
export type AddFollowUpInput = z.infer<typeof addFollowUpSchema>;

export const markLostSchema = z.object({
  reason: z.enum(['price', 'competitor', 'no_budget', 'no_response', 'other']),
});
export type MarkLostInput = z.infer<typeof markLostSchema>;

export const qualifyLeadSchema = z.object({
  dealType: z.enum(['INSTALLATION', 'AMC', 'PRODUCT']),
  value: z.coerce.number().positive(),
  expectedClose: z.coerce.date().optional(),
});
export type QualifyLeadInput = z.infer<typeof qualifyLeadSchema>;

// ---------- Listing with pagination + filters ----------

export const listLeadsQuerySchema = z.object({
  status: z.nativeEnum(LeadStatus).optional(),
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

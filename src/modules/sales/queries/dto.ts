import { z } from 'zod';
import { MeetingType, QueryPriority, SalesQueryStatus, FollowUpStatus } from '@prisma/client';
import { REMARK_REQUIRED_STATUSES } from './pipeline';

// ---------- Sales Query CRUD ----------

export const createSalesQuerySchema = z.object({
  customerId: z.string().optional(),
  customerName: z.string().min(1),
  companyName: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email().optional(),
  address: z.string().optional(),
  gstNumber: z.string().optional(),
  city: z.string().optional(),
  meetingType: z.nativeEnum(MeetingType),
  visitDate: z.coerce.date().optional(),
  visitLocation: z.string().optional(),
  gpsLatitude: z.coerce.number().optional(),
  gpsLongitude: z.coerce.number().optional(),
  subject: z.string().optional(),
  requirement: z.string().min(1),
  priority: z.nativeEnum(QueryPriority).optional().default(QueryPriority.MEDIUM),
  productInterest: z.string().optional(),
  quantity: z.coerce.number().int().positive().optional(),
  budget: z.coerce.number().positive().optional(),
  estimatedValue: z.coerce.number().positive().optional(),
  expectedDeliveryDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
  slaDeadline: z.coerce.date().optional(),
  tags: z.array(z.string()).optional(),
  labels: z.record(z.unknown()).optional(),
  regionId: z.string().optional(),
  ownerId: z.string().optional(),
  assignedToId: z.string().optional(),
});
export type CreateSalesQueryInput = z.infer<typeof createSalesQuerySchema>;

export const updateSalesQuerySchema = z.object({
  customerName: z.string().min(1).optional(),
  companyName: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email().optional(),
  address: z.string().optional(),
  gstNumber: z.string().optional(),
  city: z.string().optional(),
  meetingType: z.nativeEnum(MeetingType).optional(),
  visitDate: z.coerce.date().optional(),
  visitLocation: z.string().optional(),
  gpsLatitude: z.coerce.number().optional(),
  gpsLongitude: z.coerce.number().optional(),
  subject: z.string().optional(),
  requirement: z.string().min(1).optional(),
  priority: z.nativeEnum(QueryPriority).optional(),
  productInterest: z.string().optional(),
  quantity: z.coerce.number().int().positive().optional(),
  budget: z.coerce.number().positive().optional(),
  estimatedValue: z.coerce.number().positive().optional(),
  expectedDeliveryDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
  slaDeadline: z.coerce.date().optional(),
  tags: z.array(z.string()).optional(),
  labels: z.record(z.unknown()).optional(),
});
export type UpdateSalesQueryInput = z.infer<typeof updateSalesQuerySchema>;

export const assignDepartmentSchema = z.object({
  departmentId: z.string().min(1),
  remark: z.string().optional(),
});
export type AssignDepartmentInput = z.infer<typeof assignDepartmentSchema>;

export const reassignOwnerSchema = z.object({
  ownerId: z.string().min(1),
  assignedToId: z.string().optional(),
  remark: z.string().optional(),
});
export type ReassignOwnerInput = z.infer<typeof reassignOwnerSchema>;

export const transitionStatusSchema = z
  .object({
    toStatus: z.nativeEnum(SalesQueryStatus),
    remark: z.string().optional(),
  })
  .refine((data) => !REMARK_REQUIRED_STATUSES.includes(data.toStatus) || !!data.remark, {
    message: 'A remark is required for this status change',
    path: ['remark'],
  });
export type TransitionStatusInput = z.infer<typeof transitionStatusSchema>;

// ---------- Listing with pagination + advanced filters ----------

export const listSalesQueriesQuerySchema = z.object({
  status: z.nativeEnum(SalesQueryStatus).optional(),
  priority: z.nativeEnum(QueryPriority).optional(),
  departmentId: z.string().optional(),
  ownerId: z.string().optional(),
  assignedToId: z.string().optional(),
  productInterest: z.string().optional(),
  customerName: z.string().optional(),
  companyName: z.string().optional(),
  city: z.string().optional(),
  queryId: z.string().optional(),
  refNo: z.string().optional(),
  createdBy: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  dueDateFrom: z.coerce.date().optional(),
  dueDateTo: z.coerce.date().optional(),
  tags: z.string().optional(), // comma-separated
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(200).optional().default(50),
  sortBy: z.enum(['createdAt', 'updatedAt', 'dueDate', 'priority', 'estimatedValue']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});
export type ListSalesQueriesQuery = z.infer<typeof listSalesQueriesQuerySchema>;

// ---------- Comments ----------

export const createCommentSchema = z.object({
  body: z.string().min(1),
  parentId: z.string().optional(),
  isInternalNote: z.boolean().optional().default(false),
  mentionedUserIds: z.array(z.string()).optional().default([]),
  isPinned: z.boolean().optional().default(false),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const updateCommentSchema = z.object({
  body: z.string().min(1),
});
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;

export const pinCommentSchema = z.object({
  isPinned: z.boolean(),
});
export type PinCommentInput = z.infer<typeof pinCommentSchema>;

// ---------- Follow-ups ----------

export const createFollowUpSchema = z.object({
  title: z.string().min(1),
  note: z.string().optional(),
  scheduledAt: z.coerce.date(),
  reminderMinutes: z.coerce.number().int().positive().optional(),
  channel: z.enum(['call', 'meeting', 'email', 'whatsapp', 'on_site', 'other']).optional(),
  assignedToId: z.string().optional(),
});
export type CreateFollowUpInput = z.infer<typeof createFollowUpSchema>;

export const updateFollowUpSchema = z.object({
  title: z.string().min(1).optional(),
  note: z.string().optional(),
  scheduledAt: z.coerce.date().optional(),
  reminderMinutes: z.coerce.number().int().positive().optional(),
  channel: z.enum(['call', 'meeting', 'email', 'whatsapp', 'on_site', 'other']).optional(),
  assignedToId: z.string().optional(),
});
export type UpdateFollowUpInput = z.infer<typeof updateFollowUpSchema>;

export const completeFollowUpSchema = z.object({
  customerResponse: z.string().optional(),
  outcome: z.string().optional(),
});
export type CompleteFollowUpInput = z.infer<typeof completeFollowUpSchema>;

export const rescheduleFollowUpSchema = z.object({
  scheduledAt: z.coerce.date(),
  note: z.string().optional(),
  reminderMinutes: z.coerce.number().int().positive().optional(),
});
export type RescheduleFollowUpInput = z.infer<typeof rescheduleFollowUpSchema>;

export const listFollowUpsQuerySchema = z.object({
  status: z.nativeEnum(FollowUpStatus).optional(),
  assignedToId: z.string().optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  includeOverdue: z.coerce.boolean().optional().default(false),
});
export type ListFollowUpsQuery = z.infer<typeof listFollowUpsQuerySchema>;

// ---------- Reports ----------

export const reportQuerySchema = z.object({
  reportType: z.enum([
    'sales_conversion',
    'pending_queries',
    'follow_ups',
    'employee_performance',
    'department_performance',
    'resolution_time',
    'lost_opportunity',
    'monthly_sales',
  ]),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  departmentId: z.string().optional(),
  userId: z.string().optional(),
  regionId: z.string().optional(),
  format: z.enum(['json', 'csv', 'excel']).optional().default('json'),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;

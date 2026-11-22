import { z } from 'zod';
import { EmployeeLifecycleStatus, EmploymentType, Gender, HrDocumentCategory } from '@prisma/client';

const MOBILE_REGEX = /^(?:\+?91[-\s]?|0)?[6-9]\d{9}$/;
const optionalDate = z.coerce.date().nullable().optional();
const optionalText = (max = 300) => z.string().trim().max(max).nullable().optional();

export const listEmployeesQuerySchema = z.object({
  search: z.string().optional(), // name, email, employee code, phone
  departmentId: z.string().optional(),
  designationId: z.string().optional(),
  regionId: z.string().optional(),
  lifecycleStatus: z.nativeEnum(EmployeeLifecycleStatus).optional(),
  employmentType: z.nativeEnum(EmploymentType).optional(),
  includeExited: z.coerce.boolean().optional().default(false),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(200).optional().default(25),
  sortBy: z.enum(['name', 'joiningDate', 'createdAt']).optional().default('name'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc'),
});
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;

// Fields an employee may edit on their own profile.
const selfEditableShape = {
  phone: z.string().trim().regex(MOBILE_REGEX, 'Enter a valid 10-digit mobile number').nullable().optional(),
  personalEmail: z.string().trim().email('Enter a valid email').nullable().optional(),
  currentAddress: optionalText(500),
  permanentAddress: optionalText(500),
  emergencyContactName: optionalText(120),
  emergencyContactPhone: z.string().trim().regex(MOBILE_REGEX, 'Enter a valid 10-digit mobile number').nullable().optional(),
  emergencyContactRel: optionalText(60),
};

export const updateMyProfileSchema = z.object(selfEditableShape);
export type UpdateMyEmployeeProfileInput = z.infer<typeof updateMyProfileSchema>;

// HR edit. Department / designation / status / manager changes are recorded
// as lifecycle events with `effectiveDate` (defaults to today).
export const updateEmployeeSchema = z.object({
  ...selfEditableShape,
  dateOfBirth: optionalDate,
  gender: z.nativeEnum(Gender).nullable().optional(),
  designationId: z.string().nullable().optional(),
  departmentId: z.string().nullable().optional(),
  reportingToId: z.string().nullable().optional(),
  // Branch transfer — Super Admin only (moving someone out of a region-scoped HR's region).
  regionId: z.string().min(1).optional(),
  employmentType: z.nativeEnum(EmploymentType).optional(),
  lifecycleStatus: z.nativeEnum(EmployeeLifecycleStatus).optional(),
  joiningDate: optionalDate,
  probationStartsOn: optionalDate,
  probationEndsOn: optionalDate,
  confirmedOn: optionalDate,
  noticePeriodDays: z.coerce.number().int().min(0).max(365).nullable().optional(),
  exitDate: optionalDate,
  workLocation: optionalText(200),
  effectiveDate: z.coerce.date().optional(),
  note: z.string().trim().max(500).optional(),
});
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const upper = (v: string) => v.trim().toUpperCase();

// null clears a field; omitted leaves it unchanged.
export const upsertStatutorySchema = z.object({
  bankName: optionalText(120),
  bankAccount: z.string().trim().regex(/^\d{6,18}$/, 'Account number must be 6–18 digits').nullable().optional(),
  ifsc: z.string().transform(upper).pipe(z.string().regex(IFSC_REGEX, 'Enter a valid IFSC (e.g. HDFC0001234)')).nullable().optional(),
  pan: z.string().transform(upper).pipe(z.string().regex(PAN_REGEX, 'Enter a valid PAN (e.g. ABCDE1234F)')).nullable().optional(),
  aadhaar: z.string().transform((v) => v.replace(/\s/g, '')).pipe(z.string().regex(/^\d{12}$/, 'Aadhaar must be 12 digits')).nullable().optional(),
  uan: z.string().trim().regex(/^\d{12}$/, 'UAN must be 12 digits').nullable().optional(),
  pfNumber: optionalText(30),
  esiNumber: optionalText(30),
});
export type UpsertStatutoryInput = z.infer<typeof upsertStatutorySchema>;

export const uploadDocumentSchema = z.object({
  category: z.nativeEnum(HrDocumentCategory),
  title: z.string().trim().min(1, 'Title is required').max(150),
});
export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;

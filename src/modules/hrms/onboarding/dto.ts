import { z } from 'zod';
import { EmployeeLifecycleStatus, EmploymentType, Gender, OnboardingTaskOwner, Role } from '@prisma/client';

const MOBILE_REGEX = /^(?:\+?91[-\s]?|0)?[6-9]\d{9}$/;
const optionalId = z.string().min(1).nullable().optional();
const optionalDate = z.coerce.date().nullable().optional();

// One request creates the login (User), the HR record (Employee) and the
// onboarding checklist, atomically.
export const onboardEmployeeSchema = z.object({
  // Account
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, 'Temporary password must be at least 8 characters'),
  role: z.nativeEnum(Role),
  regionId: z.string().min(1),
  reportingToId: optionalId,
  // Employment
  designationId: optionalId,
  departmentId: optionalId,
  employmentType: z.nativeEnum(EmploymentType).optional().default(EmploymentType.FULL_TIME),
  lifecycleStatus: z
    .enum([EmployeeLifecycleStatus.ONBOARDING, EmployeeLifecycleStatus.PROBATION, EmployeeLifecycleStatus.CONFIRMED])
    .optional()
    .default(EmployeeLifecycleStatus.ONBOARDING),
  joiningDate: z.coerce.date(),
  probationEndsOn: optionalDate,
  noticePeriodDays: z.coerce.number().int().min(0).max(365).nullable().optional(),
  workLocation: z.string().trim().max(200).nullable().optional(),
  // Personal
  phone: z.string().trim().regex(MOBILE_REGEX, 'Enter a valid 10-digit mobile number').nullable().optional(),
  personalEmail: z.string().trim().email('Enter a valid email').nullable().optional(),
  dateOfBirth: optionalDate,
  gender: z.nativeEnum(Gender).nullable().optional(),
  // Checklist template to copy; null/omitted = no checklist.
  templateId: optionalId,
});
export type OnboardEmployeeInput = z.infer<typeof onboardEmployeeSchema>;

export const updateOnboardingTaskSchema = z.object({ done: z.boolean() });
export type UpdateOnboardingTaskInput = z.infer<typeof updateOnboardingTaskSchema>;

export const addOnboardingTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(500).nullable().optional(),
  owner: z.nativeEnum(OnboardingTaskOwner).optional().default(OnboardingTaskOwner.HR),
  dueDate: optionalDate,
});
export type AddOnboardingTaskInput = z.infer<typeof addOnboardingTaskSchema>;

const templateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(500).nullable().optional(),
  owner: z.nativeEnum(OnboardingTaskOwner).optional().default(OnboardingTaskOwner.HR),
  dueOffsetDays: z.coerce.number().int().min(-60).max(365).optional().default(0),
});

export const upsertTemplateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  active: z.boolean().optional().default(true),
  tasks: z.array(templateTaskSchema).max(50),
});
export type UpsertTemplateInput = z.infer<typeof upsertTemplateSchema>;

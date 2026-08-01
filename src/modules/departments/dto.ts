import { z } from 'zod';
import { DepartmentMemberRole } from '@prisma/client';

export const createDepartmentSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  regionId: z.string().optional(), // omit for a cross-region/shared department
});
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

export const updateDepartmentSchema = z.object({
  name: z.string().min(1).optional(),
  active: z.boolean().optional(),
});
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;

export const addMemberSchema = z.object({
  userId: z.string().min(1),
  roleInDept: z.nativeEnum(DepartmentMemberRole).default(DepartmentMemberRole.EMPLOYEE),
});
export type AddMemberInput = z.infer<typeof addMemberSchema>;

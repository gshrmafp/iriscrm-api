import { z } from 'zod';
import { PermissionEffect, Role, UserStatus } from '@prisma/client';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.nativeEnum(Role),
  regionId: z.string().min(1),
  reportingToId: z.string().optional(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const createRegionSchema = z.object({
  code: z.string().min(1).max(10),
  name: z.string().min(1),
});
export type CreateRegionInput = z.infer<typeof createRegionSchema>;

export const updateRegionSchema = z.object({
  active: z.boolean(),
});
export type UpdateRegionInput = z.infer<typeof updateRegionSchema>;

export const updateUserStatusSchema = z.object({
  status: z.nativeEnum(UserStatus),
});
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;

// Status has its own dedicated endpoint (with its own "can't deactivate
// yourself" guard) — deliberately excluded here to keep that concern
// separate.
export const updateUserSchema = z
  .object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    role: z.nativeEnum(Role).optional(),
    regionId: z.string().min(1).optional(),
    reportingToId: z.string().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const permissionOverrideSchema = z.object({
  permissionKey: z.string().min(1),
  effect: z.nativeEnum(PermissionEffect),
  reason: z.string().optional(),
  expiresAt: z.coerce.date().optional(),
});
export type PermissionOverrideInput = z.infer<typeof permissionOverrideSchema>;

// ---------- Listing with pagination + filters ----------

export const listUsersQuerySchema = z.object({
  role: z.nativeEnum(Role).optional(),
  regionId: z.string().optional(),
  status: z.nativeEnum(UserStatus).optional(),
  search: z.string().optional(), // matches name / email
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(200).optional().default(50),
  sortBy: z.enum(['createdAt', 'name', 'email']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

import { z } from 'zod';
import { PicklistType } from '@prisma/client';

export const listPicklistQuerySchema = z.object({
  listType: z.nativeEnum(PicklistType),
});
export type ListPicklistQuery = z.infer<typeof listPicklistQuerySchema>;

export const createPicklistOptionSchema = z.object({
  listType: z.nativeEnum(PicklistType),
  code: z
    .string()
    .min(1)
    .regex(/^[A-Z0-9_]+$/, 'Code must be UPPER_SNAKE_CASE'),
  label: z.string().min(1),
  sortOrder: z.coerce.number().int().optional().default(0),
});
export type CreatePicklistOptionInput = z.infer<typeof createPicklistOptionSchema>;

export const updatePicklistOptionSchema = z.object({
  label: z.string().min(1).optional(),
  active: z.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
});
export type UpdatePicklistOptionInput = z.infer<typeof updatePicklistOptionSchema>;

import { z } from 'zod';
import { PriceRuleType } from '@prisma/client';

export const createCatalogItemSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  unit: z.string().min(1),
  basePrice: z.coerce.number().positive(),
  taxClass: z.string().min(1),
});
export type CreateCatalogItemInput = z.infer<typeof createCatalogItemSchema>;

export const updateCatalogItemSchema = createCatalogItemSchema.partial().extend({
  active: z.boolean().optional(),
});
export type UpdateCatalogItemInput = z.infer<typeof updateCatalogItemSchema>;

// ---------- Listing with pagination + filters ----------

export const listCatalogItemsQuerySchema = z.object({
  category: z.string().optional(),
  taxClass: z.string().optional(),
  active: z.coerce.boolean().optional(),
  search: z.string().optional(), // matches code / name
  page: z.coerce.number().int().positive().optional().default(1),
  // Higher ceiling than other list endpoints: the catalog is a small, fixed
  // reference dataset (hundreds, not thousands) and several pickers
  // (quotation builder, price rules, win dialog) need to fetch it in full.
  pageSize: z.coerce.number().int().positive().max(500).optional().default(50),
  sortBy: z.enum(['name', 'basePrice', 'createdAt', 'category']).optional().default('name'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc'),
});
export type ListCatalogItemsQuery = z.infer<typeof listCatalogItemsQuerySchema>;

export const createPriceRuleSchema = z.object({
  catalogItemId: z.string().min(1),
  regionId: z.string().optional(),
  ruleType: z.nativeEnum(PriceRuleType),
  value: z.coerce.number(),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().optional(),
});
export type CreatePriceRuleInput = z.infer<typeof createPriceRuleSchema>;

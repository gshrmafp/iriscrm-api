import { z } from 'zod';

const contactSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
});

const addressSchema = z.object({
  line1: z.string().min(1),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
});

export const createCustomerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.string().min(1, 'Type is required'), // e.g. Individual, Business
  contacts: z.array(contactSchema).optional(),
  addresses: z.array(addressSchema).optional(),
  regionId: z.string().optional(), // Admin may override; defaults to creator's region
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const listCustomersQuerySchema = z.object({
  search: z.string().optional(), // matches name
  active: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(200).optional().default(50),
  sortBy: z.enum(['createdAt', 'updatedAt', 'name']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;

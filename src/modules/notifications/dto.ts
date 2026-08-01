import { z } from 'zod';

export const listNotificationsQuerySchema = z.object({
  unreadOnly: z.coerce.boolean().optional().default(false),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

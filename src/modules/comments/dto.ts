import { z } from 'zod';

export const createEntityCommentSchema = z.object({
  body: z.string().min(1),
  isInternalNote: z.boolean().optional().default(false),
  mentionedUserIds: z.array(z.string()).optional().default([]),
});
export type CreateEntityCommentInput = z.infer<typeof createEntityCommentSchema>;

export const updateEntityCommentSchema = z.object({
  body: z.string().min(1),
});
export type UpdateEntityCommentInput = z.infer<typeof updateEntityCommentSchema>;

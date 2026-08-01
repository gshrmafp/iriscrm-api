import { CommentEntityType } from '@prisma/client';
import { prisma } from '../../core/db/prisma';
import { CreateEntityCommentInput } from './dto';

const authorSelect = { id: true, name: true, email: true, role: true } as const;

export const entityCommentRepository = {
  list(entityType: CommentEntityType, entityId: string) {
    return prisma.entityComment.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: authorSelect } },
    });
  },

  findById(id: string) {
    return prisma.entityComment.findUnique({ where: { id } });
  },

  create(
    entityType: CommentEntityType,
    entityId: string,
    authorId: string,
    input: CreateEntityCommentInput,
  ) {
    return prisma.entityComment.create({
      data: { entityType, entityId, authorId, ...input },
      include: { author: { select: authorSelect } },
    });
  },

  update(id: string, body: string) {
    return prisma.entityComment.update({
      where: { id },
      data: { body, edited: true, editedAt: new Date() },
      include: { author: { select: authorSelect } },
    });
  },

  softDelete(id: string) {
    return prisma.entityComment.update({
      where: { id },
      data: { deleted: true, deletedAt: new Date(), body: '[deleted]' },
      include: { author: { select: authorSelect } },
    });
  },
};

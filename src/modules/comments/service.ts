import { CommentEntityType, Role } from '@prisma/client';
import { AuthUser } from '../../core/middleware/types';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../core/errors/AppError';
import { entityCommentRepository } from './repository';
import { CreateEntityCommentInput } from './dto';

type EntityAccessCheck = (entityId: string, actor: AuthUser) => Promise<unknown>;

// Registered lazily by each owning module (leads/service.ts, opportunities/service.ts)
// to avoid a hard import cycle — this module only needs "does the actor have
// visibility into this entity", not the entity's full shape.
const accessChecks: Partial<Record<CommentEntityType, EntityAccessCheck>> = {};

export function registerCommentEntityAccessCheck(entityType: CommentEntityType, check: EntityAccessCheck) {
  accessChecks[entityType] = check;
}

async function assertEntityAccess(entityType: CommentEntityType, entityId: string, actor: AuthUser) {
  const check = accessChecks[entityType];
  if (!check) throw new BadRequestError(`No access check registered for ${entityType}`);
  await check(entityId, actor);
}

// Comments are a permanent audit trail once posted — not even the author may
// edit or delete their own comment. Only a Super Admin can, mirroring the
// same policy applied to Sales Query comments.
export const entityCommentService = {
  async list(entityType: CommentEntityType, entityId: string, actor: AuthUser) {
    await assertEntityAccess(entityType, entityId, actor);
    return entityCommentRepository.list(entityType, entityId);
  },

  async create(
    entityType: CommentEntityType,
    entityId: string,
    actor: AuthUser,
    input: CreateEntityCommentInput,
  ) {
    await assertEntityAccess(entityType, entityId, actor);
    return entityCommentRepository.create(entityType, entityId, actor.id, input);
  },

  async update(
    entityType: CommentEntityType,
    entityId: string,
    commentId: string,
    actor: AuthUser,
    body: string,
  ) {
    await assertEntityAccess(entityType, entityId, actor);
    const comment = await entityCommentRepository.findById(commentId);
    if (!comment || comment.entityType !== entityType || comment.entityId !== entityId) {
      throw new NotFoundError('Comment not found');
    }
    if (comment.deleted) throw new BadRequestError('Cannot edit a deleted comment');
    if (actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenError('Only a Super Admin can edit a comment');
    }
    return entityCommentRepository.update(commentId, body);
  },

  async remove(
    entityType: CommentEntityType,
    entityId: string,
    commentId: string,
    actor: AuthUser,
  ) {
    await assertEntityAccess(entityType, entityId, actor);
    const comment = await entityCommentRepository.findById(commentId);
    if (!comment || comment.entityType !== entityType || comment.entityId !== entityId) {
      throw new NotFoundError('Comment not found');
    }
    if (actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenError('Only a Super Admin can delete a comment');
    }
    return entityCommentRepository.softDelete(commentId);
  },
};

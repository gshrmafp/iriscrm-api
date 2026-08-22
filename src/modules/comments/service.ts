import { CommentEntityType, Role } from '@prisma/client';
import { prisma } from '../../core/db/prisma';
import { AuthUser } from '../../core/middleware/types';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../core/errors/AppError';
import { eventBus, DOMAIN_EVENTS } from '../../core/events/eventBus';
import { entityCommentRepository } from './repository';
import { CreateEntityCommentInput } from './dto';

// The entity shape actually varies (Lead vs Opportunity), but every access
// check returns at least these two fields — which is all mention-resolution
// and self-mention filtering below need.
type EntityAccessResult = { regionId: string; ownerId: string };
type EntityAccessCheck = (entityId: string, actor: AuthUser) => Promise<EntityAccessResult>;

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
  return check(entityId, actor);
}

// Leads/Opportunities have no department-membership concept like Sales
// Queries do — the closest equivalent "who could plausibly be tagged" set is
// anyone in the entity's own region (mirrors the region-scoped user directory
// the frontend's @mention autocomplete already draws from).
async function resolveRegionMentionIds(regionId: string, requested: string[]) {
  if (requested.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: requested }, regionId },
    select: { id: true },
  });
  return users.map((u) => u.id);
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
    const entity = await assertEntityAccess(entityType, entityId, actor);
    const mentionedUserIds = await resolveRegionMentionIds(entity.regionId, input.mentionedUserIds);

    const comment = await entityCommentRepository.create(entityType, entityId, actor.id, {
      ...input,
      mentionedUserIds,
    });

    mentionedUserIds
      .filter((userId) => userId !== actor.id)
      .forEach((mentionedUserId) => {
        eventBus.publish(DOMAIN_EVENTS.ENTITY_COMMENT_MENTIONED, {
          entityType,
          entityId,
          commentId: comment.id,
          mentionedUserId,
          authorId: actor.id,
        });
      });

    return comment;
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

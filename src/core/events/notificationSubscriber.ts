import {
  NotificationType,
  SalesQueryStatus,
  QueryPriority,
} from "@prisma/client";
import { prisma } from "../db/prisma";
import { eventBus, DOMAIN_EVENTS } from "./eventBus";
import { notificationRepository } from "../../modules/notifications/repository";
import { departmentRepository } from "../../modules/departments/repository";
import { queryRepository } from "../../modules/sales/queries/repository";
import { leadRepository } from "../../modules/sales/leads/repository";
import { opportunityRepository } from "../../modules/sales/opportunities/repository";
import { entityCommentRepository } from "../../modules/comments/repository";

let registered = false;

interface CreatedPayload {
  queryId: string;
  actorId: string;
  ownerId: string;
  assignedToId?: string;
}
interface ClosedPayload {
  queryId: string;
  actorId: string;
  ownerId: string;
  closingStatus: SalesQueryStatus;
}
interface AssignedPayload {
  queryId: string;
  departmentId: string;
  actorId: string;
}
interface StatusChangedPayload {
  queryId: string;
  fromStatus: SalesQueryStatus;
  toStatus: SalesQueryStatus;
  actorId: string;
  ownerId: string;
}
interface PriorityChangedPayload {
  queryId: string;
  fromPriority: QueryPriority;
  toPriority: QueryPriority;
  actorId: string;
  ownerId: string;
}
interface DueDateUpdatedPayload {
  queryId: string;
  actorId: string;
  ownerId: string;
}
interface AttachmentUploadedPayload {
  queryId: string;
  attachmentId: string;
  actorId: string;
  ownerId: string;
}
interface CommentAddedPayload {
  queryId: string;
  commentId: string;
  authorId: string;
  isInternalNote: boolean;
}
interface MentionedPayload {
  queryId: string;
  commentId: string;
  mentionedUserId: string;
  authorId: string;
}
interface FollowUpPayload {
  queryId: string;
  followUpId: string;
  assignedUserId: string;
}
interface EntityCommentMentionedPayload {
  entityType: string;
  entityId: string;
  commentId: string;
  mentionedUserId: string;
  authorId: string;
}

async function getActorName(actorId: string): Promise<string> {
  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { name: true } });
  return actor?.name ?? "Someone";
}

// Trims a comment body to a short, readable excerpt for notification text.
function excerpt(body: string, maxLength = 120): string {
  const trimmed = body.trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}…` : trimmed;
}

export function registerNotificationSubscribers() {
  if (registered) return;
  registered = true;

  eventBus.on(
    DOMAIN_EVENTS.SALES_QUERY_CREATED,
    async (payload: CreatedPayload) => {
      const recipients: Array<{
        userId: string;
        title: string;
        type: NotificationType;
      }> = [];
      if (payload.ownerId && payload.ownerId !== payload.actorId) {
        recipients.push({
          userId: payload.ownerId,
          type: NotificationType.QUERY_CREATED,
          title: "A new sales query has been created and assigned to you",
        });
      }
      if (
        payload.assignedToId &&
        payload.assignedToId !== payload.actorId &&
        payload.assignedToId !== payload.ownerId
      ) {
        recipients.push({
          userId: payload.assignedToId,
          type: NotificationType.QUERY_CREATED,
          title: "You have been assigned to a new sales query",
        });
      }
      if (recipients.length === 0) return;

      const [actorName, query] = await Promise.all([
        getActorName(payload.actorId),
        queryRepository.findSummaryById(payload.queryId),
      ]);
      const body = query
        ? `${actorName} created query ${query.refNo} for ${query.customerName}${query.companyName ? ` (${query.companyName})` : ""} — priority ${query.priority}.`
        : undefined;

      await notificationRepository.createMany(
        recipients.map((r) => ({
          userId: r.userId,
          type: r.type,
          entityType: "SalesQuery",
          entityId: payload.queryId,
          title: r.title,
          body,
        })),
      );
    },
  );

  eventBus.on(
    DOMAIN_EVENTS.SALES_QUERY_CLOSED,
    async (payload: ClosedPayload) => {
      if (payload.ownerId === payload.actorId) return;
      const [actorName, query] = await Promise.all([
        getActorName(payload.actorId),
        queryRepository.findSummaryById(payload.queryId),
      ]);
      await notificationRepository.create({
        userId: payload.ownerId,
        type: NotificationType.QUERY_CLOSED,
        entityType: "SalesQuery",
        entityId: payload.queryId,
        title: `Sales query has been ${payload.closingStatus.toLowerCase().replace("_", " ")}`,
        body: query
          ? `${actorName} closed query ${query.refNo} for ${query.customerName} as ${payload.closingStatus.toLowerCase().replace("_", " ")}.`
          : undefined,
      });
    },
  );

  eventBus.on(
    DOMAIN_EVENTS.SALES_QUERY_ASSIGNED,
    async (payload: AssignedPayload) => {
      if (!payload.departmentId) return;
      const memberIds = await departmentRepository.listMemberUserIds(
        payload.departmentId,
      );
      const recipientIds = memberIds.filter((userId) => userId !== payload.actorId);
      if (recipientIds.length === 0) return;

      const [actorName, query, department] = await Promise.all([
        getActorName(payload.actorId),
        queryRepository.findSummaryById(payload.queryId),
        departmentRepository.findById(payload.departmentId),
      ]);
      const body = query
        ? `${actorName} assigned query ${query.refNo} for ${query.customerName} to the ${department?.name ?? "department"}.`
        : undefined;

      await notificationRepository.createMany(
        recipientIds.map((userId) => ({
          userId,
          type: NotificationType.QUERY_ASSIGNED,
          entityType: "SalesQuery",
          entityId: payload.queryId,
          title: "A query was assigned to your department",
          body,
        })),
      );
    },
  );

  eventBus.on(
    DOMAIN_EVENTS.SALES_QUERY_STATUS_CHANGED,
    async (payload: StatusChangedPayload) => {
      if (payload.ownerId === payload.actorId) return;
      const [actorName, query] = await Promise.all([
        getActorName(payload.actorId),
        queryRepository.findSummaryById(payload.queryId),
      ]);
      await notificationRepository.create({
        userId: payload.ownerId,
        type: NotificationType.QUERY_STATUS_CHANGED,
        entityType: "SalesQuery",
        entityId: payload.queryId,
        title: `Query status changed to ${payload.toStatus}`,
        body: query
          ? `${actorName} moved query ${query.refNo} for ${query.customerName} from ${payload.fromStatus} to ${payload.toStatus}.`
          : undefined,
      });
    },
  );

  eventBus.on(
    DOMAIN_EVENTS.SALES_QUERY_PRIORITY_CHANGED,
    async (payload: PriorityChangedPayload) => {
      if (payload.ownerId === payload.actorId) return;
      const [actorName, query] = await Promise.all([
        getActorName(payload.actorId),
        queryRepository.findSummaryById(payload.queryId),
      ]);
      await notificationRepository.create({
        userId: payload.ownerId,
        type: NotificationType.QUERY_PRIORITY_CHANGED,
        entityType: "SalesQuery",
        entityId: payload.queryId,
        title: `Query priority changed from ${payload.fromPriority} to ${payload.toPriority}`,
        body: query
          ? `${actorName} changed the priority of query ${query.refNo} for ${query.customerName} from ${payload.fromPriority} to ${payload.toPriority}.`
          : undefined,
      });
    },
  );

  eventBus.on(
    DOMAIN_EVENTS.SALES_QUERY_DUE_DATE_UPDATED,
    async (payload: DueDateUpdatedPayload) => {
      if (payload.ownerId === payload.actorId) return;
      const [actorName, query] = await Promise.all([
        getActorName(payload.actorId),
        queryRepository.findSummaryById(payload.queryId),
      ]);
      const dueDateText = query?.dueDate ? query.dueDate.toLocaleDateString() : "a new date";
      await notificationRepository.create({
        userId: payload.ownerId,
        type: NotificationType.QUERY_DUE_DATE_UPDATED,
        entityType: "SalesQuery",
        entityId: payload.queryId,
        title: "Query due date has been updated",
        body: query
          ? `${actorName} set the due date for query ${query.refNo} (${query.customerName}) to ${dueDateText}.`
          : undefined,
      });
    },
  );

  eventBus.on(
    DOMAIN_EVENTS.SALES_QUERY_ATTACHMENT_UPLOADED,
    async (payload: AttachmentUploadedPayload) => {
      if (payload.ownerId === payload.actorId) return;
      const [actorName, query, attachment] = await Promise.all([
        getActorName(payload.actorId),
        queryRepository.findSummaryById(payload.queryId),
        queryRepository.findAttachmentById(payload.attachmentId),
      ]);
      await notificationRepository.create({
        userId: payload.ownerId,
        type: NotificationType.QUERY_ATTACHMENT_UPLOADED,
        entityType: "SalesQuery",
        entityId: payload.queryId,
        title: "A new attachment has been uploaded to a query",
        body: query
          ? `${actorName} uploaded ${attachment ? `"${attachment.fileName}"` : "a file"} to query ${query.refNo} (${query.customerName}).`
          : undefined,
      });
    },
  );

  eventBus.on(
    DOMAIN_EVENTS.SALES_QUERY_COMMENT_ADDED,
    async (payload: CommentAddedPayload) => {
      const query = await queryRepository.findSummaryById(payload.queryId);
      if (!query) return;
      const scope = await queryRepository.findVisibilityScope(payload.queryId);
      if (!scope || scope.ownerId === payload.authorId) return;

      const [actorName, comment] = await Promise.all([
        getActorName(payload.authorId),
        queryRepository.findCommentById(payload.commentId),
      ]);
      await notificationRepository.create({
        userId: scope.ownerId,
        type: NotificationType.QUERY_COMMENT_ADDED,
        entityType: "SalesQuery",
        entityId: payload.queryId,
        title: "New comment on your query",
        body: `${actorName} commented on query ${query.refNo} (${query.customerName})${comment ? `: "${excerpt(comment.body)}"` : "."}`,
      });
    },
  );

  eventBus.on(
    DOMAIN_EVENTS.SALES_QUERY_MENTIONED,
    async (payload: MentionedPayload) => {
      if (payload.mentionedUserId === payload.authorId) return;
      const [actorName, query, comment] = await Promise.all([
        getActorName(payload.authorId),
        queryRepository.findSummaryById(payload.queryId),
        queryRepository.findCommentById(payload.commentId),
      ]);
      await notificationRepository.create({
        userId: payload.mentionedUserId,
        type: NotificationType.QUERY_MENTIONED,
        // Points at the query itself (not the comment) so clicking the
        // notification actually lands somewhere navigable.
        entityType: "SalesQuery",
        entityId: payload.queryId,
        title: "You were mentioned in a comment",
        body:
          query && comment
            ? `${actorName} mentioned you in a comment on query ${query.refNo} (${query.customerName}): "${excerpt(comment.body)}"`
            : undefined,
      });
    },
  );

  eventBus.on(
    DOMAIN_EVENTS.ENTITY_COMMENT_MENTIONED,
    async (payload: EntityCommentMentionedPayload) => {
      if (payload.mentionedUserId === payload.authorId) return;

      const isLead = payload.entityType === "LEAD";
      const [actorName, comment, lead, opportunity] = await Promise.all([
        getActorName(payload.authorId),
        entityCommentRepository.findById(payload.commentId),
        isLead ? leadRepository.findById(payload.entityId) : Promise.resolve(null),
        isLead ? Promise.resolve(null) : opportunityRepository.findById(payload.entityId),
      ]);
      const label = isLead ? "lead" : "opportunity";
      const displayName = isLead ? lead?.contactName : opportunity?.lead.contactName;

      await notificationRepository.create({
        userId: payload.mentionedUserId,
        type: NotificationType.ENTITY_MENTIONED,
        // Points at the Lead/Opportunity itself (payload.entityId is already
        // the parent id, not the comment id) so the notification is
        // actually navigable.
        entityType: isLead ? "Lead" : "Opportunity",
        entityId: payload.entityId,
        title: `You were mentioned in a ${label} comment`,
        body:
          comment && displayName
            ? `${actorName} mentioned you in a comment on ${label} "${displayName}": "${excerpt(comment.body)}"`
            : undefined,
      });
    },
  );

  eventBus.on(DOMAIN_EVENTS.FOLLOW_UP_DUE, async (payload: FollowUpPayload) => {
    const [query, followUp] = await Promise.all([
      queryRepository.findSummaryById(payload.queryId),
      queryRepository.findFollowUpById(payload.followUpId),
    ]);
    await notificationRepository.create({
      userId: payload.assignedUserId,
      type: NotificationType.FOLLOW_UP_DUE,
      // Points at the parent query (there's no standalone follow-up page —
      // follow-ups render within the query detail page).
      entityType: "SalesQuery",
      entityId: payload.queryId,
      title: "A follow-up is due soon",
      body:
        query && followUp
          ? `Follow-up "${followUp.title}" for query ${query.refNo} (${query.customerName}) is due ${followUp.scheduledAt.toLocaleString()}.`
          : undefined,
    });
  });

  eventBus.on(
    DOMAIN_EVENTS.FOLLOW_UP_OVERDUE,
    async (payload: FollowUpPayload) => {
      const [query, followUp] = await Promise.all([
        queryRepository.findSummaryById(payload.queryId),
        queryRepository.findFollowUpById(payload.followUpId),
      ]);
      await notificationRepository.create({
        userId: payload.assignedUserId,
        type: NotificationType.FOLLOW_UP_OVERDUE,
        entityType: "SalesQuery",
        entityId: payload.queryId,
        title: "A follow-up is now overdue",
        body:
          query && followUp
            ? `Follow-up "${followUp.title}" for query ${query.refNo} (${query.customerName}) was due ${followUp.scheduledAt.toLocaleString()} and is now overdue.`
            : undefined,
      });
    },
  );
}

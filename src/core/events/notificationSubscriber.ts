import {
  NotificationType,
  SalesQueryStatus,
  QueryPriority,
} from "@prisma/client";
import { eventBus, DOMAIN_EVENTS } from "./eventBus";
import { notificationRepository } from "../../modules/notifications/repository";
import { departmentRepository } from "../../modules/departments/repository";
import { queryRepository } from "../../modules/sales/queries/repository";

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
      if (recipients.length > 0) {
        await notificationRepository.createMany(
          recipients.map((r) => ({
            userId: r.userId,
            type: r.type,
            entityType: "SalesQuery",
            entityId: payload.queryId,
            title: r.title,
          })),
        );
      }
    },
  );

  eventBus.on(
    DOMAIN_EVENTS.SALES_QUERY_CLOSED,
    async (payload: ClosedPayload) => {
      if (payload.ownerId === payload.actorId) return;
      await notificationRepository.create({
        userId: payload.ownerId,
        type: NotificationType.QUERY_CLOSED,
        entityType: "SalesQuery",
        entityId: payload.queryId,
        title: `Sales query has been ${payload.closingStatus.toLowerCase().replace("_", " ")}`,
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
      await notificationRepository.createMany(
        memberIds
          .filter((userId) => userId !== payload.actorId)
          .map((userId) => ({
            userId,
            type: NotificationType.QUERY_ASSIGNED,
            entityType: "SalesQuery",
            entityId: payload.queryId,
            title: "A query was assigned to your department",
          })),
      );
    },
  );

  eventBus.on(
    DOMAIN_EVENTS.SALES_QUERY_STATUS_CHANGED,
    async (payload: StatusChangedPayload) => {
      if (payload.ownerId === payload.actorId) return;
      await notificationRepository.create({
        userId: payload.ownerId,
        type: NotificationType.QUERY_STATUS_CHANGED,
        entityType: "SalesQuery",
        entityId: payload.queryId,
        title: `Query status changed to ${payload.toStatus}`,
      });
    },
  );

  eventBus.on(
    DOMAIN_EVENTS.SALES_QUERY_PRIORITY_CHANGED,
    async (payload: PriorityChangedPayload) => {
      if (payload.ownerId === payload.actorId) return;
      await notificationRepository.create({
        userId: payload.ownerId,
        type: NotificationType.QUERY_PRIORITY_CHANGED,
        entityType: "SalesQuery",
        entityId: payload.queryId,
        title: `Query priority changed from ${payload.fromPriority} to ${payload.toPriority}`,
      });
    },
  );

  eventBus.on(
    DOMAIN_EVENTS.SALES_QUERY_DUE_DATE_UPDATED,
    async (payload: DueDateUpdatedPayload) => {
      if (payload.ownerId === payload.actorId) return;
      await notificationRepository.create({
        userId: payload.ownerId,
        type: NotificationType.QUERY_DUE_DATE_UPDATED,
        entityType: "SalesQuery",
        entityId: payload.queryId,
        title: "Query due date has been updated",
      });
    },
  );

  eventBus.on(
    DOMAIN_EVENTS.SALES_QUERY_ATTACHMENT_UPLOADED,
    async (payload: AttachmentUploadedPayload) => {
      if (payload.ownerId === payload.actorId) return;
      await notificationRepository.create({
        userId: payload.ownerId,
        type: NotificationType.QUERY_ATTACHMENT_UPLOADED,
        entityType: "SalesQuery",
        entityId: payload.queryId,
        title: "A new attachment has been uploaded to a query",
      });
    },
  );

  eventBus.on(
    DOMAIN_EVENTS.SALES_QUERY_COMMENT_ADDED,
    async (payload: CommentAddedPayload) => {
      const query = await queryRepository.findById(payload.queryId);
      if (query && query.ownerId !== payload.authorId) {
        await notificationRepository.create({
          userId: query.ownerId,
          type: NotificationType.QUERY_COMMENT_ADDED,
          entityType: "SalesQuery",
          entityId: payload.queryId,
          title: "New comment on your query",
        });
      }
    },
  );

  eventBus.on(
    DOMAIN_EVENTS.SALES_QUERY_MENTIONED,
    async (payload: MentionedPayload) => {
      if (payload.mentionedUserId === payload.authorId) return;
      await notificationRepository.create({
        userId: payload.mentionedUserId,
        type: NotificationType.QUERY_MENTIONED,
        entityType: "QueryComment",
        entityId: payload.commentId,
        title: "You were mentioned in a comment",
      });
    },
  );

  eventBus.on(DOMAIN_EVENTS.FOLLOW_UP_DUE, async (payload: FollowUpPayload) => {
    await notificationRepository.create({
      userId: payload.assignedUserId,
      type: NotificationType.FOLLOW_UP_DUE,
      entityType: "QueryFollowUp",
      entityId: payload.followUpId,
      title: "A follow-up is due soon",
    });
  });

  eventBus.on(
    DOMAIN_EVENTS.FOLLOW_UP_OVERDUE,
    async (payload: FollowUpPayload) => {
      await notificationRepository.create({
        userId: payload.assignedUserId,
        type: NotificationType.FOLLOW_UP_OVERDUE,
        entityType: "QueryFollowUp",
        entityId: payload.followUpId,
        title: "A follow-up is now overdue",
      });
    },
  );
}

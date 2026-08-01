import { Prisma, Role, SalesQuery } from "@prisma/client";
import { AuthUser } from "../../../core/middleware/types";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../../../core/errors/AppError";
import { CROSS_REGION_ROLES } from "../../../config/permissions";
import { assertSameRegionOrElevated } from "../../../core/rbac/regionScope";
import { eventBus, DOMAIN_EVENTS } from "../../../core/events/eventBus";
import { storage } from "../../../core/storage";
import { identityRepository } from "../../identity/repository";
import { departmentRepository } from "../../departments/repository";
import { queryRepository } from "./repository";
import { isValidQueryTransition } from "./pipeline";
import {
  AssignDepartmentInput,
  CreateCommentInput,
  CreateFollowUpInput,
  CreateSalesQueryInput,
  ListFollowUpsQuery,
  ListSalesQueriesQuery,
  ReassignOwnerInput,
  ReportQuery,
  TransitionStatusInput,
  UpdateFollowUpInput,
  UpdateSalesQueryInput,
} from "./dto";

function canManageAllQueries(role: Role) {
  return role === Role.SUPER_ADMIN || role === Role.REGIONAL_ADMIN;
}

async function loadVisibleOrThrow(id: string, actor: AuthUser) {
  const query = await queryRepository.findById(id);
  if (!query) throw new NotFoundError("Sales query not found");
  assertSameRegionOrElevated(actor, query.regionId);

  if (canManageAllQueries(actor.role) || query.ownerId === actor.id)
    return query;
  if (query.assignedToId === actor.id) return query;

  if (actor.role === Role.SALES_MANAGER) {
    const reportIds = await identityRepository.listDirectReportIds(actor.id);
    if (reportIds.includes(query.ownerId)) return query;
  }

  if (query.departmentId) {
    const membership = await departmentRepository.findMembership(
      query.departmentId,
      actor.id,
    );
    if (membership) return query;
  }

  throw new ForbiddenError("You do not have access to this sales query");
}

async function assertDepartmentAuthorized(
  query: SalesQuery,
  actor: AuthUser,
  opts?: { requireManager?: boolean },
) {
  if (canManageAllQueries(actor.role)) return;
  if (query.ownerId === actor.id && !opts?.requireManager) return;
  if (query.assignedToId === actor.id && !opts?.requireManager) return;

  if (!opts?.requireManager && actor.role === Role.SALES_MANAGER) {
    const reportIds = await identityRepository.listDirectReportIds(actor.id);
    if (reportIds.includes(query.ownerId)) return;
  }

  if (!query.departmentId) {
    throw new ForbiddenError("Query is not yet assigned to a department");
  }
  const membership = await departmentRepository.findMembership(
    query.departmentId,
    actor.id,
  );
  if (!membership)
    throw new ForbiddenError("You are not a member of the assigned department");
  if (opts?.requireManager && membership.roleInDept !== "MANAGER") {
    throw new ForbiddenError(
      "Only a department manager may perform this action",
    );
  }
}

async function resolveVisibleMentionIds(
  query: {
    departmentId: string | null;
    ownerId: string;
    assignedToId: string | null;
  },
  requested: string[],
) {
  if (requested.length === 0) return [];
  const visible = new Set<string>([query.ownerId]);
  if (query.assignedToId) visible.add(query.assignedToId);
  if (query.departmentId) {
    const memberIds = await departmentRepository.listMemberUserIds(
      query.departmentId,
    );
    memberIds.forEach((id) => visible.add(id));
  }
  return requested.filter((id) => visible.has(id));
}

export const queryService = {
  async create(actor: AuthUser, input: CreateSalesQueryInput) {
    let regionId = actor.regionId;
    if (input.regionId && input.regionId !== actor.regionId) {
      if (
        !CROSS_REGION_ROLES.includes(actor.role) &&
        actor.role !== Role.REGIONAL_ADMIN
      ) {
        throw new ForbiddenError(
          "Only an Admin can assign a query to another region",
        );
      }
      regionId = input.regionId;
    }

    const ownerId = input.ownerId ?? actor.id;
    const refNo = await queryRepository.nextRefNo();

    const query = await queryRepository.create({
      ...input,
      refNo,
      regionId,
      ownerId,
      createdBy: actor.id,
    });
    eventBus.publish(DOMAIN_EVENTS.SALES_QUERY_CREATED, {
      queryId: query.id,
      actorId: actor.id,
      ownerId,
    });
    return query;
  },

  async buildListWhere(
    actor: AuthUser,
    filters: ListSalesQueriesQuery,
  ): Promise<Prisma.SalesQueryWhereInput> {
    const base: Prisma.SalesQueryWhereInput = { deletedAt: null };

    if (CROSS_REGION_ROLES.includes(actor.role)) return base;
    if (actor.role === Role.REGIONAL_ADMIN || actor.role === Role.AUDITOR) {
      return { ...base, regionId: actor.regionId };
    }

    if (actor.role === Role.SALES_MANAGER) {
      const reportIds = await identityRepository.listDirectReportIds(actor.id);
      return {
        ...base,
        regionId: actor.regionId,
        OR: [{ ownerId: { in: [actor.id, ...reportIds] } }],
      };
    }

    const departmentIds = await departmentRepository.listMemberDepartmentIds(
      actor.id,
    );
    if (departmentIds.length === 0) {
      return {
        ...base,
        regionId: actor.regionId,
        OR: [{ ownerId: actor.id }, { assignedToId: actor.id }],
      };
    }
    return {
      ...base,
      regionId: actor.regionId,
      OR: [
        { ownerId: actor.id },
        { assignedToId: actor.id },
        { departmentId: { in: departmentIds } },
      ],
    };
  },

  async list(actor: AuthUser, filters: ListSalesQueriesQuery) {
    const whereBase = await this.buildListWhere(actor, filters);
    return queryRepository.list({ ...filters, whereBase });
  },

  get(id: string, actor: AuthUser) {
    return loadVisibleOrThrow(id, actor);
  },

  async update(id: string, actor: AuthUser, input: UpdateSalesQueryInput) {
    const query = await loadVisibleOrThrow(id, actor);
    if (["WON", "LOST", "CANCELLED", "CLOSED"].includes(query.status)) {
      throw new BadRequestError(
        "Query is in a terminal state and cannot be edited",
      );
    }
    await assertDepartmentAuthorized(query, actor);

    // Track priority change with activity log
    if (input.priority && input.priority !== query.priority) {
      await queryRepository.changePriority(
        id,
        query.priority,
        input.priority,
        actor.id,
      );
      const { priority, ...rest } = input;
      if (Object.keys(rest).length === 0) {
        return queryRepository.findById(id);
      }
      const restResult = await queryRepository.update(id, rest);
      return queryRepository.findById(id) || restResult;
    }

    // Track due date change
    if (input.dueDate !== undefined) {
      const newDue = input.dueDate ?? null;
      const oldDue = (query as any).dueDate ?? null;
      if (String(newDue) !== String(oldDue)) {
        await queryRepository.updateDueDate(id, oldDue, newDue, actor.id);
        const { dueDate, ...rest } = input as any;
        if (Object.keys(rest).length === 0) {
          return queryRepository.findById(id);
        }
        await queryRepository.update(id, rest);
        return queryRepository.findById(id);
      }
    }

    return queryRepository.update(id, input);
  },

  async assignDepartment(
    id: string,
    actor: AuthUser,
    input: AssignDepartmentInput,
  ) {
    const query = await loadVisibleOrThrow(id, actor);
    const department = await departmentRepository.findById(input.departmentId);
    if (!department) throw new BadRequestError("Department not found");
    if (department.regionId && department.regionId !== query.regionId) {
      throw new BadRequestError(
        "Department does not belong to this query's region",
      );
    }

    const updated = await queryRepository.assignDepartment(
      id,
      input.departmentId,
      actor.id,
      input.remark,
      department.name,
    );
    eventBus.publish(DOMAIN_EVENTS.SALES_QUERY_ASSIGNED, {
      queryId: id,
      departmentId: input.departmentId,
      actorId: actor.id,
    });
    return updated;
  },

  async reassignOwner(id: string, actor: AuthUser, input: ReassignOwnerInput) {
    const query = await loadVisibleOrThrow(id, actor);
    // Basic ownership consistency check: owner must be visible / in region
    if (input.assignedToId) {
      const assignedUser = await identityRepository.findUserById(
        input.assignedToId,
      );
      if (!assignedUser) throw new BadRequestError("Assigned user not found");
      if (assignedUser.regionId !== query.regionId)
        throw new BadRequestError("Assigned user is in a different region");
    }
    const ownerUser = await identityRepository.findUserById(input.ownerId);
    if (!ownerUser) throw new BadRequestError("Owner user not found");
    if (ownerUser.regionId !== query.regionId)
      throw new BadRequestError("Owner user is in a different region");

    const updated = await queryRepository.reassignOwner(
      id,
      input.ownerId,
      input.assignedToId,
      actor.id,
      input.remark,
    );
    eventBus.publish(DOMAIN_EVENTS.SALES_QUERY_ASSIGNED, {
      queryId: id,
      departmentId: query.departmentId,
      actorId: actor.id,
      ownerId: input.ownerId,
    });
    return updated;
  },

  async transitionStatus(
    id: string,
    actor: AuthUser,
    input: TransitionStatusInput,
  ) {
    const query = await loadVisibleOrThrow(id, actor);
    await assertDepartmentAuthorized(query, actor);

    if (!isValidQueryTransition(query.status, input.toStatus)) {
      throw new BadRequestError(
        `Cannot move from ${query.status} to ${input.toStatus}`,
      );
    }

    const updated = await queryRepository.transitionStatus(
      id,
      query.status,
      input.toStatus,
      actor.id,
      input.remark,
    );
    eventBus.publish(DOMAIN_EVENTS.SALES_QUERY_STATUS_CHANGED, {
      queryId: id,
      fromStatus: query.status,
      toStatus: input.toStatus,
      actorId: actor.id,
      ownerId: query.ownerId,
    });
    if (
      input.toStatus === "CLOSED" ||
      input.toStatus === "WON" ||
      input.toStatus === "LOST"
    ) {
      eventBus.publish(DOMAIN_EVENTS.SALES_QUERY_CLOSED, {
        queryId: id,
        actorId: actor.id,
        ownerId: query.ownerId,
      });
    }
    return updated;
  },

  async addComment(id: string, actor: AuthUser, input: CreateCommentInput) {
    const query = await loadVisibleOrThrow(id, actor);
    await assertDepartmentAuthorized(query, actor);

    const mentionedUserIds = await resolveVisibleMentionIds(
      {
        departmentId: query.departmentId,
        ownerId: query.ownerId,
        assignedToId: (query as any).assignedToId ?? null,
      },
      input.mentionedUserIds,
    );

    const comment = await queryRepository.createComment({
      queryId: id,
      parentId: input.parentId,
      body: input.body,
      isInternalNote: input.isInternalNote,
      mentionedUserIds,
      authorId: actor.id,
      isPinned: input.isPinned,
    });

    eventBus.publish(DOMAIN_EVENTS.SALES_QUERY_COMMENT_ADDED, {
      queryId: id,
      commentId: comment.id,
      authorId: actor.id,
      isInternalNote: input.isInternalNote,
    });
    mentionedUserIds
      .filter((userId) => userId !== actor.id)
      .forEach((mentionedUserId) => {
        eventBus.publish(DOMAIN_EVENTS.SALES_QUERY_MENTIONED, {
          queryId: id,
          commentId: comment.id,
          mentionedUserId,
          authorId: actor.id,
        });
      });

    return comment;
  },

  // Comments are a permanent audit trail once posted — not even the author
  // may edit or delete their own comment. Only a Super Admin can, for the
  // rare case of removing genuinely abusive/incorrect content.
  async updateComment(
    queryId: string,
    commentId: string,
    actor: AuthUser,
    body: string,
  ) {
    await loadVisibleOrThrow(queryId, actor);
    const comment = await queryRepository.findCommentById(commentId);
    if (!comment || comment.queryId !== queryId)
      throw new NotFoundError("Comment not found");
    if (comment.deleted)
      throw new BadRequestError("Cannot edit a deleted comment");
    if (actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenError("Only a Super Admin can edit a comment");
    }
    return queryRepository.updateComment(commentId, body);
  },

  async deleteComment(queryId: string, commentId: string, actor: AuthUser) {
    await loadVisibleOrThrow(queryId, actor);
    const comment = await queryRepository.findCommentById(commentId);
    if (!comment || comment.queryId !== queryId)
      throw new NotFoundError("Comment not found");
    if (actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenError("Only a Super Admin can delete a comment");
    }
    return queryRepository.softDeleteComment(commentId);
  },

  async pinComment(
    queryId: string,
    commentId: string,
    actor: AuthUser,
    isPinned: boolean,
  ) {
    const query = await loadVisibleOrThrow(queryId, actor);
    const comment = await queryRepository.findCommentById(commentId);
    if (!comment || comment.queryId !== queryId)
      throw new NotFoundError("Comment not found");
    // Mirrors updateComment/deleteComment: pinning your own comment only
    // needs the basic comment permission already checked at the route;
    // pinning someone else's comment requires department-manager (or
    // admin-tier) authorization.
    if (comment.authorId !== actor.id) {
      await assertDepartmentAuthorized(query, actor, { requireManager: true });
    }
    return queryRepository.pinComment(commentId, isPinned, actor.id);
  },

  async addAttachment(
    id: string,
    actor: AuthUser,
    file: { buffer: Buffer; originalname: string; mimetype: string },
    commentId?: string,
  ) {
    const query = await loadVisibleOrThrow(id, actor);
    await assertDepartmentAuthorized(query, actor);

    const stored = await storage.upload({
      buffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
      scope: `sales-queries/${id}`,
    });

    const att = await queryRepository.createAttachment({
      queryId: id,
      commentId,
      fileName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: stored.sizeBytes,
      storageKey: stored.storageKey,
      uploadedBy: actor.id,
    });
    if (!commentId) {
      eventBus.publish(DOMAIN_EVENTS.SALES_QUERY_ATTACHMENT_UPLOADED, {
        queryId: id,
        actorId: actor.id,
        attachmentId: att.id,
      });
    }
    return att;
  },

  async getAttachmentFilePath(
    queryId: string,
    attachmentId: string,
    actor: AuthUser,
  ) {
    await loadVisibleOrThrow(queryId, actor);
    const attachment = await queryRepository.findAttachmentById(attachmentId);
    if (!attachment || attachment.queryId !== queryId)
      throw new NotFoundError("Attachment not found");
    return { attachment, filePath: storage.getFilePath(attachment.storageKey) };
  },

  // ---------- Follow-ups ----------
  async addFollowUp(id: string, actor: AuthUser, input: CreateFollowUpInput) {
    const query = await loadVisibleOrThrow(id, actor);
    await assertDepartmentAuthorized(query, actor);
    return queryRepository.createFollowUp({
      ...input,
      queryId: id,
      createdBy: actor.id,
    });
  },

  async listFollowUps(
    id: string,
    actor: AuthUser,
    filters: ListFollowUpsQuery,
  ) {
    await loadVisibleOrThrow(id, actor);
    return queryRepository.listFollowUps(id, filters);
  },

  async updateFollowUp(
    queryId: string,
    followUpId: string,
    actor: AuthUser,
    input: UpdateFollowUpInput,
  ) {
    const query = await loadVisibleOrThrow(queryId, actor);
    const fu = await queryRepository.findFollowUpById(followUpId);
    if (!fu || fu.queryId !== queryId)
      throw new NotFoundError("Follow-up not found");
    await assertDepartmentAuthorized(query, actor);
    return queryRepository.updateFollowUp(followUpId, input);
  },

  async completeFollowUp(
    queryId: string,
    followUpId: string,
    actor: AuthUser,
    customerResponse?: string,
    outcome?: string,
  ) {
    const query = await loadVisibleOrThrow(queryId, actor);
    const fu = await queryRepository.findFollowUpById(followUpId);
    if (!fu || fu.queryId !== queryId)
      throw new NotFoundError("Follow-up not found");
    await assertDepartmentAuthorized(query, actor);
    return queryRepository.completeFollowUp(
      followUpId,
      customerResponse,
      outcome,
    );
  },

  async rescheduleFollowUp(
    queryId: string,
    followUpId: string,
    actor: AuthUser,
    scheduledAt: Date,
    note?: string,
    reminderMinutes?: number,
  ) {
    const query = await loadVisibleOrThrow(queryId, actor);
    const fu = await queryRepository.findFollowUpById(followUpId);
    if (!fu || fu.queryId !== queryId)
      throw new NotFoundError("Follow-up not found");
    await assertDepartmentAuthorized(query, actor);
    return queryRepository.rescheduleFollowUp(
      followUpId,
      scheduledAt,
      note,
      reminderMinutes,
    );
  },

  async cancelFollowUp(queryId: string, followUpId: string, actor: AuthUser) {
    const query = await loadVisibleOrThrow(queryId, actor);
    const fu = await queryRepository.findFollowUpById(followUpId);
    if (!fu || fu.queryId !== queryId)
      throw new NotFoundError("Follow-up not found");
    await assertDepartmentAuthorized(query, actor);
    return queryRepository.cancelFollowUp(followUpId);
  },

  // ---------- Dashboard ----------
  async getDashboard(actor: AuthUser) {
    const whereBase = await this.buildListWhere(actor, {} as any);
    return queryRepository.getDashboardStats(
      actor.id,
      actor.role,
      actor.regionId,
      whereBase,
    );
  },

  // ---------- Reports ----------
  async runReport(actor: AuthUser, params: ReportQuery) {
    const whereBase = await this.buildListWhere(actor, {} as any);
    const regionScope = CROSS_REGION_ROLES.includes(actor.role)
      ? params.regionId
      : actor.regionId;
    const result = await queryRepository.runReport({
      reportType: params.reportType,
      fromDate: params.fromDate,
      toDate: params.toDate,
      departmentId: params.departmentId,
      userId: params.userId,
      regionId: regionScope,
    });
    // CSV export support
    if (params.format === "csv" && Array.isArray(result)) {
      const rows = result as any[];
      if (rows.length === 0) return { csv: "", data: [] };
      const headers = Object.keys(rows[0]).join(",");
      const body = rows
        .map((r) =>
          Object.values(r)
            .map((v) => {
              if (v === null || v === undefined) return "";
              const s = String(v).replace(/"/g, '""');
              return `"${s}"`;
            })
            .join(","),
        )
        .join("\n");
      return { csv: `${headers}\n${body}`, data: result };
    }
    return result;
  },
};

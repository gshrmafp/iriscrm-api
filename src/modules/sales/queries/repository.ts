import {
  Prisma,
  SalesQueryStatus,
  FollowUpStatus,
  QueryPriority,
} from "@prisma/client";
import { prisma } from "../../../core/db/prisma";
import {
  CreateSalesQueryInput,
  UpdateSalesQueryInput,
  ListSalesQueriesQuery,
} from "./dto";

export const queryRepository = {
  // ---------- List + Pagination + Advanced Filters ----------
  async list(
    filters: ListSalesQueriesQuery & {
      whereBase?: Prisma.SalesQueryWhereInput;
    },
  ) {
    const {
      page = 1,
      pageSize = 50,
      sortBy = "createdAt",
      sortOrder = "desc",
      customerName,
      companyName,
      city,
      queryId,
      refNo,
      createdBy,
      dateFrom,
      dateTo,
      dueDateFrom,
      dueDateTo,
      tags,
      status,
      priority,
      departmentId,
      ownerId,
      assignedToId,
      productInterest,
      whereBase,
    } = filters;

    const where: Prisma.SalesQueryWhereInput = {
      deletedAt: null,
      ...(whereBase ?? {}),
    };
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (departmentId) where.departmentId = departmentId;
    if (ownerId) where.ownerId = ownerId;
    if (assignedToId) where.assignedToId = assignedToId;
    if (productInterest)
      where.productInterest = {
        contains: productInterest,
        mode: "insensitive",
      };
    if (customerName)
      where.customerName = { contains: customerName, mode: "insensitive" };
    if (companyName)
      where.companyName = { contains: companyName, mode: "insensitive" };
    if (city) where.city = { contains: city, mode: "insensitive" };
    if (queryId) where.id = queryId;
    if (refNo) where.refNo = { contains: refNo, mode: "insensitive" };
    if (createdBy) where.createdBy = createdBy;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) (where.createdAt as Prisma.DateTimeFilter).gte = dateFrom;
      if (dateTo) (where.createdAt as Prisma.DateTimeFilter).lte = dateTo;
    }
    if (dueDateFrom || dueDateTo) {
      where.dueDate = {};
      if (dueDateFrom)
        (where.dueDate as Prisma.DateTimeFilter).gte = dueDateFrom;
      if (dueDateTo) (where.dueDate as Prisma.DateTimeFilter).lte = dueDateTo;
    }
    if (tags) {
      const tagList = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const tagConditions: any[] = tagList.map((t) => ({
        tags: { array_contains: JSON.stringify([t]) },
      }));
      if (where.AND && Array.isArray(where.AND)) {
        where.AND = [...(where.AND as any[]), ...tagConditions];
      } else {
        where.AND = tagConditions;
      }
    }

    const primaryOrderBy: Prisma.SalesQueryOrderByWithRelationInput = {};
    if (sortBy === "priority") {
      const priorityRank: Record<string, number> = {
        URGENT: 4,
        HIGH: 3,
        MEDIUM: 2,
        LOW: 1,
      };
      primaryOrderBy.priority = sortOrder as "asc" | "desc";
      const priorityCondition = {
        priority: { in: Object.keys(priorityRank) as QueryPriority[] },
      };
      if (where.AND && Array.isArray(where.AND)) {
        where.AND = [...(where.AND as any[]), priorityCondition];
      } else if (where.AND) {
        where.AND = [where.AND as any, priorityCondition];
      } else {
        where.AND = [priorityCondition];
      }
    } else {
      primaryOrderBy[sortBy] = sortOrder as "asc" | "desc";
    }
    // Tiebreaker keeps pagination deterministic across identical requests
    // when bulk-seeded rows share the same createdAt (or same priority).
    const orderBy: Prisma.SalesQueryOrderByWithRelationInput[] = [primaryOrderBy, { id: "asc" }];

    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      prisma.salesQuery.findMany({
        where,
        include: {
          department: true,
          owner: { select: { id: true, name: true, email: true, role: true } },
          assignedTo: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
        orderBy,
        skip,
        take: pageSize,
      }),
      prisma.salesQuery.count({ where }),
    ]);
    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  },

  findVisibilityScope(id: string) {
    return prisma.salesQuery.findFirst({
      where: { id, deletedAt: null },
      select: {
        regionId: true,
        ownerId: true,
        assignedToId: true,
        departmentId: true,
      },
    });
  },

  findCommentsForQuery(queryId: string) {
    return prisma.queryComment.findMany({
      where: { queryId, parentId: null },
      orderBy: [{ isPinned: "desc" }, { createdAt: "asc" }],
      include: {
        author: {
          select: { id: true, name: true, email: true, role: true },
        },
        replies: {
          orderBy: { createdAt: "asc" },
          include: {
            attachments: true,
            author: {
              select: { id: true, name: true, email: true, role: true },
            },
          },
        },
        attachments: true,
      },
    });
  },

  findById(id: string) {
    return prisma.salesQuery.findFirst({
      where: { id, deletedAt: null },
      include: {
        department: true,
        owner: { select: { id: true, name: true, email: true, role: true } },
        assignedTo: {
          select: { id: true, name: true, email: true, role: true },
        },
        comments: {
          where: { parentId: null },
          orderBy: [{ isPinned: "desc" }, { createdAt: "asc" }],
          include: {
            author: {
              select: { id: true, name: true, email: true, role: true },
            },
            replies: {
              orderBy: { createdAt: "asc" },
              include: {
                attachments: true,
                author: {
                  select: { id: true, name: true, email: true, role: true },
                },
              },
            },
            attachments: true,
          },
        },
        attachments: {
          where: { commentId: null },
          orderBy: { createdAt: "desc" },
        },
        activities: { orderBy: { createdAt: "asc" } },
        followUps: { orderBy: { scheduledAt: "asc" } },
      },
    });
  },

  async nextRefNo() {
    const year = new Date().getFullYear();
    const sequenceId = `SALES_QUERY_${year}`;
    const seq = await prisma.sequence.upsert({
      where: { id: sequenceId },
      update: { nextValue: { increment: 1 } },
      create: { id: sequenceId, nextValue: 2 },
    });
    const currentVal = seq.nextValue - 1;
    return `SAL-${year}-${String(currentVal).padStart(5, "0")}`;
  },

  create(
    input: CreateSalesQueryInput & {
      refNo: string;
      regionId: string;
      ownerId: string;
      createdBy: string;
    },
  ) {
    return prisma.$transaction(async (tx) => {
      const query = await tx.salesQuery.create({
        data: {
          refNo: input.refNo,
          customerId: input.customerId,
          customerName: input.customerName,
          companyName: input.companyName,
          contactPhone: input.contactPhone,
          contactEmail: input.contactEmail,
          address: input.address,
          gstNumber: input.gstNumber,
          city: input.city,
          meetingType: input.meetingType,
          visitDate: input.visitDate,
          visitLocation: input.visitLocation,
          gpsLatitude: input.gpsLatitude as any,
          gpsLongitude: input.gpsLongitude as any,
          subject: input.subject,
          requirement: input.requirement,
          priority: input.priority,
          productInterest: input.productInterest,
          quantity: input.quantity,
          budget: input.budget as any,
          estimatedValue: input.estimatedValue,
          expectedDeliveryDate: input.expectedDeliveryDate,
          dueDate: input.dueDate,
          slaDeadline: input.slaDeadline,
          tags: input.tags as any,
          labels: input.labels as any,
          regionId: input.regionId,
          ownerId: input.ownerId,
          assignedToId: input.assignedToId,
          createdBy: input.createdBy,
        },
      });
      await tx.queryActivity.create({
        data: {
          queryId: query.id,
          actorId: input.createdBy,
          action: "CREATED",
          toStatus: SalesQueryStatus.NEW,
          field: "status",
          fromValue: null,
          toValue: "NEW",
        },
      });
      return query;
    });
  },

  update(id: string, input: UpdateSalesQueryInput) {
    const cleaned: Record<string, any> = { ...input };
    if (cleaned.gpsLatitude !== undefined)
      cleaned.gpsLatitude = cleaned.gpsLatitude as any;
    if (cleaned.gpsLongitude !== undefined)
      cleaned.gpsLongitude = cleaned.gpsLongitude as any;
    if (cleaned.budget !== undefined) cleaned.budget = cleaned.budget as any;
    if (cleaned.tags !== undefined) cleaned.tags = cleaned.tags as any;
    if (cleaned.labels !== undefined) cleaned.labels = cleaned.labels as any;
    return prisma.salesQuery.update({ where: { id }, data: cleaned });
  },

  assignDepartment(
    id: string,
    departmentId: string,
    actorId: string,
    remark: string | undefined,
    departmentName: string,
  ) {
    return prisma.$transaction(async (tx) => {
      const old = await tx.salesQuery.findUnique({
        where: { id },
        select: { departmentId: true },
      });
      const updated = await tx.salesQuery.update({
        where: { id },
        data: { departmentId, status: SalesQueryStatus.ASSIGNED },
      });
      await tx.queryActivity.create({
        data: {
          queryId: id,
          actorId,
          action: "ASSIGNED",
          field: "department",
          fromValue: old?.departmentId ?? null,
          toValue: departmentId,
          remark: remark ?? `Assigned to department ${departmentName}`,
        },
      });
      return updated;
    });
  },

  reassignOwner(
    id: string,
    ownerId: string,
    assignedToId: string | undefined,
    actorId: string,
    remark?: string,
  ) {
    return prisma.$transaction(async (tx) => {
      const old = await tx.salesQuery.findUnique({
        where: { id },
        select: { ownerId: true, assignedToId: true },
      });
      const updated = await tx.salesQuery.update({
        where: { id },
        data: { ownerId, assignedToId: assignedToId ?? old?.assignedToId },
      });
      if (old?.ownerId !== ownerId) {
        await tx.queryActivity.create({
          data: {
            queryId: id,
            actorId,
            action: "OWNER_CHANGED",
            field: "owner",
            fromValue: old?.ownerId ?? null,
            toValue: ownerId,
            remark,
          },
        });
      }
      if (assignedToId && old?.assignedToId !== assignedToId) {
        await tx.queryActivity.create({
          data: {
            queryId: id,
            actorId,
            action: "ASSIGNED",
            field: "assignedTo",
            fromValue: old?.assignedToId ?? null,
            toValue: assignedToId,
            remark,
          },
        });
      }
      return updated;
    });
  },

  transitionStatus(
    id: string,
    fromStatus: SalesQueryStatus,
    toStatus: SalesQueryStatus,
    actorId: string,
    remark?: string,
  ) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.salesQuery.update({
        where: { id },
        data: {
          status: toStatus,
          closeReason: ["LOST", "CANCELLED", "CLOSED"].includes(toStatus)
            ? (remark ?? undefined)
            : undefined,
        },
      });
      await tx.queryActivity.create({
        data: {
          queryId: id,
          actorId,
          action: "STATUS_CHANGED",
          fromStatus,
          toStatus,
          field: "status",
          fromValue: fromStatus,
          toValue: toStatus,
          remark,
        },
      });
      return updated;
    });
  },

  // ---------- Priority / Due Date ----------
  changePriority(
    id: string,
    oldPriority: QueryPriority,
    newPriority: QueryPriority,
    actorId: string,
  ) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.salesQuery.update({
        where: { id },
        data: { priority: newPriority },
      });
      await tx.queryActivity.create({
        data: {
          queryId: id,
          actorId,
          action: "PRIORITY_CHANGED",
          field: "priority",
          fromValue: oldPriority,
          toValue: newPriority,
        },
      });
      return updated;
    });
  },

  updateDueDate(
    id: string,
    oldDue: Date | null,
    newDue: Date | null,
    actorId: string,
  ) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.salesQuery.update({
        where: { id },
        data: { dueDate: newDue },
      });
      await tx.queryActivity.create({
        data: {
          queryId: id,
          actorId,
          action: "DUE_DATE_UPDATED",
          field: "dueDate",
          fromValue: oldDue ? oldDue.toISOString() : null,
          toValue: newDue ? newDue.toISOString() : null,
        },
      });
      return updated;
    });
  },

  // ---------- Comments ----------
  createComment(input: {
    queryId: string;
    parentId?: string;
    body: string;
    isInternalNote: boolean;
    mentionedUserIds: string[];
    authorId: string;
    isPinned?: boolean;
  }) {
    return prisma.$transaction(async (tx) => {
      const comment = await tx.queryComment.create({ data: input });
      await tx.queryActivity.create({
        data: {
          queryId: comment.queryId,
          actorId: input.authorId,
          action: "COMMENT_ADDED",
          field: "comment",
          toValue: comment.id,
        },
      });
      return comment;
    });
  },

  findCommentById(id: string) {
    return prisma.queryComment.findUnique({ where: { id } });
  },

  updateComment(id: string, body: string) {
    return prisma.queryComment.update({
      where: { id },
      data: { body, edited: true, editedAt: new Date() },
    });
  },

  softDeleteComment(id: string) {
    return prisma.queryComment.update({
      where: { id },
      data: { deleted: true, deletedAt: new Date(), body: "[deleted]" },
    });
  },

  pinComment(id: string, isPinned: boolean, actorId: string) {
    return prisma.queryComment.update({
      where: { id },
      data: {
        isPinned,
        pinnedAt: isPinned ? new Date() : null,
        pinnedBy: isPinned ? actorId : null,
      },
    });
  },

  // ---------- Attachments ----------
  createAttachment(input: {
    queryId: string;
    commentId?: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    storageKey: string;
    uploadedBy: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const att = await tx.queryAttachment.create({ data: input });
      if (!input.commentId) {
        await tx.queryActivity.create({
          data: {
            queryId: input.queryId,
            actorId: input.uploadedBy,
            action: "ATTACHMENT_ADDED",
            field: "attachment",
            toValue: att.id,
          },
        });
      }
      return att;
    });
  },

  findAttachmentById(id: string) {
    return prisma.queryAttachment.findFirst({ where: { id, deletedAt: null } });
  },

  // ---------- Follow-ups ----------
  createFollowUp(input: {
    queryId: string;
    title: string;
    note?: string;
    scheduledAt: Date;
    reminderMinutes?: number;
    channel?: string;
    assignedToId?: string;
    createdBy: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const fu = await tx.queryFollowUp.create({ data: input as any });
      await tx.queryActivity.create({
        data: {
          queryId: input.queryId,
          actorId: input.createdBy,
          action: "FOLLOW_UP_ADDED",
          field: "followUp",
          toValue: fu.id,
        },
      });
      return fu;
    });
  },

  findFollowUpById(id: string) {
    return prisma.queryFollowUp.findFirst({ where: { id, deletedAt: null } });
  },

  listFollowUps(
    queryId: string,
    filters: {
      status?: FollowUpStatus;
      assignedToId?: string;
      fromDate?: Date;
      toDate?: Date;
      includeOverdue?: boolean;
    },
  ) {
    const where: Prisma.QueryFollowUpWhereInput = { queryId, deletedAt: null };
    if (filters.status) where.status = filters.status;
    if (filters.assignedToId) where.assignedToId = filters.assignedToId;
    if (filters.fromDate || filters.toDate) {
      where.scheduledAt = {};
      if (filters.fromDate) (where.scheduledAt as any).gte = filters.fromDate;
      if (filters.toDate) (where.scheduledAt as any).lte = filters.toDate;
    }
    if (filters.includeOverdue) {
      where.OR = [
        where,
        {
          scheduledAt: { lt: new Date() },
          status: { in: [FollowUpStatus.PENDING] },
        },
      ] as any;
    }
    return prisma.queryFollowUp.findMany({
      where,
      orderBy: { scheduledAt: "asc" },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    });
  },

  updateFollowUp(id: string, data: any) {
    return prisma.queryFollowUp.update({ where: { id }, data });
  },

  completeFollowUp(id: string, customerResponse?: string, outcome?: string) {
    return prisma.queryFollowUp.update({
      where: { id },
      data: {
        status: FollowUpStatus.COMPLETED,
        customerResponse,
        outcome,
        completedAt: new Date(),
      },
    });
  },

  cancelFollowUp(id: string) {
    return prisma.queryFollowUp.update({
      where: { id },
      data: { status: FollowUpStatus.CANCELLED },
    });
  },

  rescheduleFollowUp(
    id: string,
    scheduledAt: Date,
    note?: string,
    reminderMinutes?: number,
  ) {
    return prisma.queryFollowUp.update({
      where: { id },
      data: {
        scheduledAt,
        status: FollowUpStatus.RESCHEDULED,
        note: note ?? undefined,
        reminderMinutes,
        rescheduledCount: { increment: 1 },
      },
    });
  },

  // ---------- Dashboard Stats ----------
  async getDashboardStats(
    actorId: string,
    role: string,
    regionId: string,
    whereBase: Prisma.SalesQueryWhereInput,
  ) {
    const base: Prisma.SalesQueryWhereInput = { deletedAt: null, ...whereBase };

    const [
      total,
      open,
      won,
      lost,
      byStatus,
      byPriority,
      pendingFollowUps,
      overdueFollowUps,
    ] = await Promise.all([
      prisma.salesQuery.count({ where: base }),
      prisma.salesQuery.count({
        where: {
          ...base,
          status: {
            notIn: [
              SalesQueryStatus.WON,
              SalesQueryStatus.LOST,
              SalesQueryStatus.CANCELLED,
              SalesQueryStatus.CLOSED,
            ],
          },
        },
      }),
      prisma.salesQuery.count({
        where: { ...base, status: SalesQueryStatus.WON },
      }),
      prisma.salesQuery.count({
        where: { ...base, status: SalesQueryStatus.LOST },
      }),
      prisma.salesQuery.groupBy({ by: ["status"], where: base, _count: true }),
      prisma.salesQuery.groupBy({
        by: ["priority"],
        where: base,
        _count: true,
      }),
      prisma.queryFollowUp.count({
        where: {
          status: FollowUpStatus.PENDING,
          deletedAt: null,
          query: { deletedAt: null, ...(whereBase as any) },
        },
      }),
      prisma.queryFollowUp.count({
        where: {
          status: FollowUpStatus.PENDING,
          scheduledAt: { lt: new Date() },
          deletedAt: null,
          query: { deletedAt: null, ...(whereBase as any) },
        },
      }),
    ]);

    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const endOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999,
    );
    const todayVisits = await prisma.salesQuery.count({
      where: { ...base, visitDate: { gte: startOfToday, lte: endOfToday } },
    });

    const recentlyUpdated = await prisma.salesQuery.findMany({
      where: base,
      orderBy: { updatedAt: "desc" },
      take: 10,
      include: {
        owner: { select: { id: true, name: true } },
        department: true,
      },
    });

    // Sales funnel value
    const funnel = await prisma.salesQuery.aggregate({
      where: base,
      _sum: { estimatedValue: true, budget: true },
    });

    // Conversion rate
    const converted = won;
    const closedTotal = won + lost;
    const conversionRate =
      closedTotal > 0 ? Math.round((converted / closedTotal) * 100) : 0;

    return {
      summary: {
        totalQueries: total,
        openQueries: open,
        wonQueries: won,
        lostQueries: lost,
        conversionRate,
        pendingFollowUps,
        overdueFollowUps,
        todayVisits,
        totalEstimatedValue: funnel._sum.estimatedValue ?? 0,
        totalBudget: funnel._sum.budget ?? 0,
      },
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count })),
      byPriority: byPriority.map((p) => ({
        priority: p.priority,
        count: p._count,
      })),
      recentlyUpdated,
    };
  },

  // ---------- Reports ----------
  async runReport(params: {
    reportType: string;
    fromDate?: Date;
    toDate?: Date;
    departmentId?: string;
    userId?: string;
    regionId?: string;
  }) {
    const { reportType, fromDate, toDate, departmentId, userId, regionId } =
      params;
    const dateFilter: Prisma.DateTimeFilter = {};
    if (fromDate) dateFilter.gte = fromDate;
    if (toDate) dateFilter.lte = toDate;

    const base: Prisma.SalesQueryWhereInput = { deletedAt: null };
    if (fromDate || toDate) base.createdAt = dateFilter;
    if (departmentId) base.departmentId = departmentId;
    if (regionId) base.regionId = regionId;
    if (userId) base.OR = [{ ownerId: userId }, { createdBy: userId }];

    switch (reportType) {
      case "pending_queries": {
        const pending = await prisma.salesQuery.findMany({
          where: {
            ...base,
            status: {
              notIn: [
                SalesQueryStatus.WON,
                SalesQueryStatus.LOST,
                SalesQueryStatus.CANCELLED,
                SalesQueryStatus.CLOSED,
              ],
            },
          },
          select: {
            refNo: true,
            customerName: true,
            companyName: true,
            city: true,
            contactPhone: true,
            status: true,
            priority: true,
            dueDate: true,
            createdAt: true,
            owner: { select: { name: true } },
            department: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
        });
        // Flattened to plain strings rather than nested owner/department
        // objects — this feeds a generic report table on the frontend that
        // renders every value with String(), which would otherwise show
        // "[object Object]" for a relation.
        return pending.map(({ owner, department, ...rest }) => ({
          ...rest,
          ownerName: owner?.name ?? null,
          departmentName: department?.name ?? null,
        }));
      }

      case "sales_conversion": {
        const [wonC, lostC, totalC] = await Promise.all([
          prisma.salesQuery.count({
            where: { ...base, status: SalesQueryStatus.WON },
          }),
          prisma.salesQuery.count({
            where: { ...base, status: SalesQueryStatus.LOST },
          }),
          prisma.salesQuery.count({ where: base }),
        ]);
        const val = await prisma.salesQuery.aggregate({
          where: { ...base, status: SalesQueryStatus.WON },
          _sum: { estimatedValue: true },
        });
        return {
          total: totalC,
          won: wonC,
          lost: lostC,
          closed: wonC + lostC,
          conversionRate: wonC + lostC > 0 ? wonC / (wonC + lostC) : 0,
          wonValue: val._sum.estimatedValue ?? 0,
        };
      }

      case "follow_ups": {
        const followUps = await prisma.queryFollowUp.findMany({
          where: {
            deletedAt: null,
            ...(fromDate || toDate ? { scheduledAt: dateFilter } : {}),
          },
          select: {
            title: true,
            note: true,
            scheduledAt: true,
            channel: true,
            status: true,
            outcome: true,
            query: { select: { refNo: true, customerName: true, status: true } },
            assignedTo: { select: { name: true } },
          },
          orderBy: { scheduledAt: "asc" },
        });
        return followUps.map(({ query, assignedTo, ...rest }) => ({
          ...rest,
          queryRefNo: query.refNo,
          queryCustomerName: query.customerName,
          queryStatus: query.status,
          assignedToName: assignedTo?.name ?? null,
        }));
      }

      case "resolution_time": {
        const closed = await prisma.salesQuery.findMany({
          where: {
            ...base,
            status: {
              in: [
                SalesQueryStatus.WON,
                SalesQueryStatus.LOST,
                SalesQueryStatus.CANCELLED,
                SalesQueryStatus.CLOSED,
              ],
            },
          },
          select: {
            refNo: true,
            customerName: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            owner: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 500,
        });
        return closed.map(({ owner, ...q }) => ({
          ...q,
          ownerName: owner?.name ?? null,
          resolutionHours: Math.round(
            (q.updatedAt.getTime() - q.createdAt.getTime()) / (1000 * 60 * 60),
          ),
        }));
      }

      case "lost_opportunity": {
        const lost = await prisma.salesQuery.findMany({
          where: { ...base, status: SalesQueryStatus.LOST },
          select: {
            refNo: true,
            customerName: true,
            companyName: true,
            closeReason: true,
            estimatedValue: true,
            updatedAt: true,
            owner: { select: { name: true } },
            department: { select: { name: true } },
          },
          orderBy: { updatedAt: "desc" },
        });
        return lost.map(({ owner, department, ...rest }) => ({
          ...rest,
          ownerName: owner?.name ?? null,
          departmentName: department?.name ?? null,
        }));
      }

      case "employee_performance": {
        const ownerGrouped = await prisma.salesQuery.groupBy({
          by: ["ownerId"],
          where: base,
          _count: true,
        });
        const owners = await prisma.user.findMany({
          where: { id: { in: ownerGrouped.map((g) => g.ownerId) } },
          select: { id: true, name: true },
        });
        const ownerNameById = new Map(owners.map((o) => [o.id, o.name]));
        return Promise.all(
          ownerGrouped.map(async (g) => {
            const won = await prisma.salesQuery.count({
              where: {
                ...base,
                ownerId: g.ownerId,
                status: SalesQueryStatus.WON,
              },
            });
            const lost = await prisma.salesQuery.count({
              where: {
                ...base,
                ownerId: g.ownerId,
                status: SalesQueryStatus.LOST,
              },
            });
            return {
              ownerName: ownerNameById.get(g.ownerId) ?? g.ownerId,
              total: g._count,
              won,
              lost,
              conversionRate: won + lost > 0 ? won / (won + lost) : 0,
            };
          }),
        );
      }

      case "department_performance": {
        const deptGrouped = await prisma.salesQuery.groupBy({
          by: ["departmentId"],
          where: { ...base, departmentId: { not: null } },
          _count: true,
        });
        const departments = await prisma.department.findMany({
          where: { id: { in: deptGrouped.map((g) => g.departmentId).filter((id): id is string => !!id) } },
          select: { id: true, name: true },
        });
        const departmentNameById = new Map(departments.map((d) => [d.id, d.name]));
        return Promise.all(
          deptGrouped.map(async (g) => {
            const won = await prisma.salesQuery.count({
              where: {
                ...base,
                departmentId: g.departmentId,
                status: SalesQueryStatus.WON,
              },
            });
            return {
              departmentName: g.departmentId ? (departmentNameById.get(g.departmentId) ?? g.departmentId) : "Unassigned",
              total: g._count,
              won,
              conversionRate: won / g._count,
            };
          }),
        );
      }

      case "monthly_sales": {
        const rows = await prisma.salesQuery.findMany({
          where: base,
          select: { createdAt: true, status: true, estimatedValue: true },
          orderBy: { createdAt: "asc" },
        });
        const byMonth: Record<string, any> = {};
        for (const r of rows) {
          const key = `${r.createdAt.getFullYear()}-${String(r.createdAt.getMonth() + 1).padStart(2, "0")}`;
          if (!byMonth[key])
            byMonth[key] = { month: key, total: 0, won: 0, lost: 0, value: 0 };
          byMonth[key].total += 1;
          if (r.status === SalesQueryStatus.WON) {
            byMonth[key].won += 1;
            byMonth[key].value += Number(r.estimatedValue ?? 0);
          }
          if (r.status === SalesQueryStatus.LOST) byMonth[key].lost += 1;
        }
        return Object.values(byMonth).sort((a, b) =>
          a.month.localeCompare(b.month),
        );
      }

      default:
        return { error: "Unknown report type" };
    }
  },
};

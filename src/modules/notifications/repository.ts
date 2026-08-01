import { NotificationType } from '@prisma/client';
import { prisma } from '../../core/db/prisma';

export const notificationRepository = {
  async list(userId: string, opts: { unreadOnly: boolean; page: number; pageSize: number }) {
    const where = { userId, ...(opts.unreadOnly ? { readAt: null } : {}) };
    const [items, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
      }),
      prisma.notification.count({ where }),
    ]);
    return { items, total };
  },

  countUnread(userId: string) {
    return prisma.notification.count({ where: { userId, readAt: null } });
  },

  findById(id: string) {
    return prisma.notification.findUnique({ where: { id } });
  },

  markRead(id: string) {
    return prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  },

  markAllRead(userId: string) {
    return prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  },

  create(input: {
    userId: string;
    type: NotificationType;
    entityType: string;
    entityId: string;
    title: string;
    body?: string;
  }) {
    return prisma.notification.create({ data: input });
  },

  createMany(
    inputs: { userId: string; type: NotificationType; entityType: string; entityId: string; title: string; body?: string }[],
  ) {
    if (inputs.length === 0) return Promise.resolve({ count: 0 });
    return prisma.notification.createMany({ data: inputs });
  },
};

import { AuthUser } from '../../core/middleware/types';
import { ForbiddenError, NotFoundError } from '../../core/errors/AppError';
import { notificationRepository } from './repository';
import { ListNotificationsQuery } from './dto';

export const notificationService = {
  list(actor: AuthUser, query: ListNotificationsQuery) {
    return notificationRepository.list(actor.id, query);
  },

  unreadCount(actor: AuthUser) {
    return notificationRepository.countUnread(actor.id);
  },

  async markRead(id: string, actor: AuthUser) {
    const notification = await notificationRepository.findById(id);
    if (!notification) throw new NotFoundError('Notification not found');
    if (notification.userId !== actor.id) throw new ForbiddenError('Not your notification');
    return notificationRepository.markRead(id);
  },

  markAllRead(actor: AuthUser) {
    return notificationRepository.markAllRead(actor.id);
  },
};

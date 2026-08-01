import { Request, Response } from 'express';
import { ok, paginated } from '../../core/http/response';
import { UnauthorizedError } from '../../core/errors/AppError';
import { notificationService } from './service';
import { ListNotificationsQuery } from './dto';

export const notificationController = {
  async list(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    const query = req.query as unknown as ListNotificationsQuery;
    const { items, total } = await notificationService.list(req.user, query);
    paginated(res, items, { page: query.page, pageSize: query.pageSize, total });
  },

  async unreadCount(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, { count: await notificationService.unreadCount(req.user) });
  },

  async markRead(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await notificationService.markRead(req.params.id, req.user));
  },

  async markAllRead(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await notificationService.markAllRead(req.user));
  },
};

import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/middleware/requireAuth';
import { requirePermission } from '../../core/middleware/requirePermission';
import { validateQuery } from '../../core/middleware/validate';
import { PERMISSIONS } from '../../config/permissions';
import { notificationController } from './controller';
import { listNotificationsQuerySchema } from './dto';

export const notificationRouter = Router();

/**
 * @openapi
 * /notifications:
 *   get:
 *     summary: List the caller's own notifications, newest first
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: unreadOnly
 *         schema: { type: boolean }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: OK }
 */
notificationRouter.get(
  '/notifications',
  requireAuth,
  requirePermission(PERMISSIONS.NOTIFICATION_VIEW),
  validateQuery(listNotificationsQuerySchema),
  asyncHandler(notificationController.list),
);

/**
 * @openapi
 * /notifications/unread-count:
 *   get:
 *     summary: Unread notification count for the caller (for a bell badge)
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 */
notificationRouter.get(
  '/notifications/unread-count',
  requireAuth,
  requirePermission(PERMISSIONS.NOTIFICATION_VIEW),
  asyncHandler(notificationController.unreadCount),
);

/**
 * @openapi
 * /notifications/read-all:
 *   post:
 *     summary: Mark all of the caller's notifications as read
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 */
notificationRouter.post(
  '/notifications/read-all',
  requireAuth,
  requirePermission(PERMISSIONS.NOTIFICATION_VIEW),
  asyncHandler(notificationController.markAllRead),
);

/**
 * @openapi
 * /notifications/{id}/read:
 *   post:
 *     summary: Mark one notification as read (must be the owner)
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 */
notificationRouter.post(
  '/notifications/:id/read',
  requireAuth,
  requirePermission(PERMISSIONS.NOTIFICATION_VIEW),
  asyncHandler(notificationController.markRead),
);

import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../../../core/http/asyncHandler';
import { requireAuth } from '../../../core/middleware/requireAuth';
import { requirePermission } from '../../../core/middleware/requirePermission';
import { validateBody, validateQuery } from '../../../core/middleware/validate';
import { PERMISSIONS } from '../../../config/permissions';
import { salesQueryController } from './controller';
import {
  assignDepartmentSchema,
  completeFollowUpSchema,
  createCommentSchema,
  createFollowUpSchema,
  createSalesQuerySchema,
  listFollowUpsQuerySchema,
  listSalesQueriesQuerySchema,
  pinCommentSchema,
  reassignOwnerSchema,
  reportQuerySchema,
  rescheduleFollowUpSchema,
  transitionStatusSchema,
  updateCommentSchema,
  updateFollowUpSchema,
  updateSalesQuerySchema,
} from './dto';

export const salesQueryRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

salesQueryRouter.get(
  '/sales-queries/dashboard/stats',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_DASHBOARD_VIEW),
  asyncHandler(salesQueryController.getDashboard),
);

salesQueryRouter.get(
  '/sales-queries/reports',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_REPORT_EXPORT),
  validateQuery(reportQuerySchema),
  asyncHandler(salesQueryController.runReport),
);

salesQueryRouter.post(
  '/sales-queries',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_QUERY_CREATE),
  validateBody(createSalesQuerySchema),
  asyncHandler(salesQueryController.create),
);
salesQueryRouter.get(
  '/sales-queries',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_QUERY_VIEW),
  validateQuery(listSalesQueriesQuerySchema),
  asyncHandler(salesQueryController.list),
);

salesQueryRouter.get(
  '/sales-queries/:id',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_QUERY_VIEW),
  asyncHandler(salesQueryController.get),
);
salesQueryRouter.patch(
  '/sales-queries/:id',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_QUERY_UPDATE),
  validateBody(updateSalesQuerySchema),
  asyncHandler(salesQueryController.update),
);

salesQueryRouter.post(
  '/sales-queries/:id/assign-department',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_QUERY_ASSIGN_DEPARTMENT),
  validateBody(assignDepartmentSchema),
  asyncHandler(salesQueryController.assignDepartment),
);

salesQueryRouter.post(
  '/sales-queries/:id/reassign-owner',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_QUERY_REASSIGN_OWNER),
  validateBody(reassignOwnerSchema),
  asyncHandler(salesQueryController.reassignOwner),
);

salesQueryRouter.patch(
  '/sales-queries/:id/status',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_QUERY_STATUS_TRANSITION),
  validateBody(transitionStatusSchema),
  asyncHandler(salesQueryController.transitionStatus),
);

salesQueryRouter.get(
  '/sales-queries/:id/comments',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_QUERY_VIEW),
  asyncHandler(salesQueryController.listComments),
);
salesQueryRouter.post(
  '/sales-queries/:id/comments',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_QUERY_COMMENT),
  validateBody(createCommentSchema),
  asyncHandler(salesQueryController.addComment),
);

salesQueryRouter.patch(
  '/sales-queries/:id/comments/:commentId',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_QUERY_COMMENT),
  validateBody(updateCommentSchema),
  asyncHandler(salesQueryController.updateComment),
);
salesQueryRouter.delete(
  '/sales-queries/:id/comments/:commentId',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_QUERY_COMMENT),
  asyncHandler(salesQueryController.deleteComment),
);
salesQueryRouter.patch(
  '/sales-queries/:id/comments/:commentId/pin',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_QUERY_COMMENT),
  validateBody(pinCommentSchema),
  asyncHandler(salesQueryController.pinComment),
);

salesQueryRouter.post(
  '/sales-queries/:id/attachments',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_QUERY_ATTACHMENT_UPLOAD),
  upload.single('file'),
  asyncHandler(salesQueryController.uploadAttachment),
);

salesQueryRouter.get(
  '/sales-queries/:id/attachments/:attachmentId',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_QUERY_VIEW),
  asyncHandler(salesQueryController.downloadAttachment),
);

salesQueryRouter.post(
  '/sales-queries/:id/follow-ups',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_QUERY_FOLLOWUP_MANAGE),
  validateBody(createFollowUpSchema),
  asyncHandler(salesQueryController.addFollowUp),
);
salesQueryRouter.get(
  '/sales-queries/:id/follow-ups',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_QUERY_FOLLOWUP_VIEW),
  validateQuery(listFollowUpsQuerySchema),
  asyncHandler(salesQueryController.listFollowUps),
);
salesQueryRouter.patch(
  '/sales-queries/:id/follow-ups/:followUpId',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_QUERY_FOLLOWUP_MANAGE),
  validateBody(updateFollowUpSchema),
  asyncHandler(salesQueryController.updateFollowUp),
);
salesQueryRouter.post(
  '/sales-queries/:id/follow-ups/:followUpId/complete',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_QUERY_FOLLOWUP_MANAGE),
  validateBody(completeFollowUpSchema),
  asyncHandler(salesQueryController.completeFollowUp),
);
salesQueryRouter.post(
  '/sales-queries/:id/follow-ups/:followUpId/reschedule',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_QUERY_FOLLOWUP_MANAGE),
  validateBody(rescheduleFollowUpSchema),
  asyncHandler(salesQueryController.rescheduleFollowUp),
);
salesQueryRouter.post(
  '/sales-queries/:id/follow-ups/:followUpId/cancel',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_QUERY_FOLLOWUP_MANAGE),
  asyncHandler(salesQueryController.cancelFollowUp),
);

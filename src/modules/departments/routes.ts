import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/middleware/requireAuth';
import { requirePermission } from '../../core/middleware/requirePermission';
import { validateBody } from '../../core/middleware/validate';
import { PERMISSIONS } from '../../config/permissions';
import { departmentController } from './controller';
import { addMemberSchema, createDepartmentSchema, updateDepartmentSchema } from './dto';

export const departmentRouter = Router();

/**
 * @openapi
 * /departments:
 *   post:
 *     summary: Create a department (Admin+)
 *     tags: [Departments]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, name]
 *             properties:
 *               code: { type: string, example: "TECH" }
 *               name: { type: string, example: "Technical/Pre-Sales" }
 *               regionId: { type: string, description: "Omit for a cross-region/shared department" }
 *     responses:
 *       201: { description: Created }
 *   get:
 *     summary: List departments visible to the caller (own region + shared)
 *     tags: [Departments]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 */
departmentRouter.post(
  '/departments',
  requireAuth,
  requirePermission(PERMISSIONS.DEPARTMENT_MANAGE),
  validateBody(createDepartmentSchema),
  asyncHandler(departmentController.create),
);
departmentRouter.get(
  '/departments',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_QUERY_VIEW),
  asyncHandler(departmentController.list),
);

/**
 * @openapi
 * /departments/{id}:
 *   get:
 *     summary: Get one department with its members
 *     tags: [Departments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *   patch:
 *     summary: Rename or deactivate a department (Admin+)
 *     tags: [Departments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 */
departmentRouter.get(
  '/departments/:id',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_QUERY_VIEW),
  asyncHandler(departmentController.get),
);
departmentRouter.patch(
  '/departments/:id',
  requireAuth,
  requirePermission(PERMISSIONS.DEPARTMENT_MANAGE),
  validateBody(updateDepartmentSchema),
  asyncHandler(departmentController.update),
);

/**
 * @openapi
 * /departments/{id}/members:
 *   post:
 *     summary: Add or update a department member (Admin+)
 *     tags: [Departments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId]
 *             properties:
 *               userId: { type: string }
 *               roleInDept: { type: string, enum: [MANAGER, EMPLOYEE], example: "EMPLOYEE" }
 *     responses:
 *       201: { description: Created }
 */
departmentRouter.post(
  '/departments/:id/members',
  requireAuth,
  requirePermission(PERMISSIONS.DEPARTMENT_MANAGE),
  validateBody(addMemberSchema),
  asyncHandler(departmentController.addMember),
);

/**
 * @openapi
 * /departments/{id}/members/{userId}:
 *   delete:
 *     summary: Remove a department member (Admin+)
 *     tags: [Departments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 */
departmentRouter.delete(
  '/departments/:id/members/:userId',
  requireAuth,
  requirePermission(PERMISSIONS.DEPARTMENT_MANAGE),
  asyncHandler(departmentController.removeMember),
);

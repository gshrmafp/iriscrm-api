import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../../core/db/prisma';
import { asyncHandler } from '../../../core/http/asyncHandler';
import { ok } from '../../../core/http/response';
import { requireAuth } from '../../../core/middleware/requireAuth';
import { requirePermission } from '../../../core/middleware/requirePermission';
import { validateBody } from '../../../core/middleware/validate';
import { ConflictError, NotFoundError, UnauthorizedError } from '../../../core/errors/AppError';
import { PERMISSIONS } from '../../../config/permissions';
import { audit } from '../_shared/audit';

export const createDesignationSchema = z.object({
  code: z.string().trim().min(1).max(20).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1).max(100),
  level: z.coerce.number().int().min(1).max(20).nullable().optional(),
});

export const updateDesignationSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  level: z.coerce.number().int().min(1).max(20).nullable().optional(),
  active: z.boolean().optional(),
});

export const designationRouter = Router();

/**
 * @openapi
 * /hrms/designations:
 *   get:
 *     summary: List designations (active first)
 *     tags: [HRMS Organization]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 *   post:
 *     summary: Create a designation (HR)
 *     tags: [HRMS Organization]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, name]
 *             properties:
 *               code: { type: string, example: "SE" }
 *               name: { type: string, example: "Sales Executive" }
 *               level: { type: integer, nullable: true }
 *     responses:
 *       201: { description: Created }
 */
designationRouter.get(
  '/hrms/designations',
  requireAuth,
  requirePermission(PERMISSIONS.HR_EMPLOYEE_VIEW),
  asyncHandler(async (_req: Request, res: Response) => {
    ok(res, await prisma.designation.findMany({ orderBy: [{ active: 'desc' }, { level: 'asc' }, { name: 'asc' }] }));
  }),
);

designationRouter.post(
  '/hrms/designations',
  requireAuth,
  requirePermission(PERMISSIONS.HR_ORG_MANAGE),
  validateBody(createDesignationSchema),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const input = req.body as z.infer<typeof createDesignationSchema>;
    const existing = await prisma.designation.findUnique({ where: { code: input.code } });
    if (existing) throw new ConflictError('A designation with this code already exists');
    const designation = await prisma.designation.create({ data: input });
    await audit(prisma, { entityType: 'Designation', entityId: designation.id, action: 'CREATE', actor: req.user, to: input });
    ok(res, designation, 201);
  }),
);

/**
 * @openapi
 * /hrms/designations/{id}:
 *   patch:
 *     summary: Rename, re-level or deactivate a designation (HR)
 *     tags: [HRMS Organization]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               level: { type: integer, nullable: true }
 *               active: { type: boolean }
 *     responses:
 *       200: { description: OK }
 */
designationRouter.patch(
  '/hrms/designations/:id',
  requireAuth,
  requirePermission(PERMISSIONS.HR_ORG_MANAGE),
  validateBody(updateDesignationSchema),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const current = await prisma.designation.findUnique({ where: { id: req.params.id } });
    if (!current) throw new NotFoundError('Designation not found');
    const designation = await prisma.designation.update({ where: { id: current.id }, data: req.body });
    await audit(prisma, { entityType: 'Designation', entityId: designation.id, action: 'UPDATE', actor: req.user, from: current, to: req.body });
    ok(res, designation);
  }),
);

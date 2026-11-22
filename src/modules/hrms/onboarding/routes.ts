import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../../core/http/asyncHandler';
import { ok } from '../../../core/http/response';
import { requireAuth } from '../../../core/middleware/requireAuth';
import { requirePermission } from '../../../core/middleware/requirePermission';
import { validateBody } from '../../../core/middleware/validate';
import { UnauthorizedError } from '../../../core/errors/AppError';
import { PERMISSIONS } from '../../../config/permissions';
import { onboardingService } from './service';
import { addOnboardingTaskSchema, onboardEmployeeSchema, updateOnboardingTaskSchema, upsertTemplateSchema } from './dto';

export const onboardingRouter = Router();

const view = [requireAuth, requirePermission(PERMISSIONS.HR_EMPLOYEE_VIEW)];
const manage = [requireAuth, requirePermission(PERMISSIONS.HR_EMPLOYEE_MANAGE)];
const settings = [requireAuth, requirePermission(PERMISSIONS.HR_SETTINGS_MANAGE)];

function actor(req: Request) {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
}

/**
 * @openapi
 * /hrms/onboarding:
 *   post:
 *     summary: Onboard a new employee — creates the login, the employee record and the onboarding checklist in one transaction. Region-scoped HR can only onboard into their own region; Super Admin, Regional Admin and HR Admin roles can only be assigned by a Super Admin.
 *     tags: [HRMS Onboarding]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password, role, regionId, joiningDate]
 *             properties:
 *               name: { type: string }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8, description: Temporary password }
 *               role: { type: string, enum: [SUPER_ADMIN, REGIONAL_ADMIN, SALES_MANAGER, SALES_EXECUTIVE, AUDITOR, HR_ADMIN] }
 *               regionId: { type: string }
 *               reportingToId: { type: string, nullable: true }
 *               designationId: { type: string, nullable: true }
 *               departmentId: { type: string, nullable: true }
 *               employmentType: { type: string, enum: [FULL_TIME, PART_TIME, CONTRACT, INTERN, CONSULTANT] }
 *               lifecycleStatus: { type: string, enum: [ONBOARDING, PROBATION, CONFIRMED] }
 *               joiningDate: { type: string, format: date }
 *               probationEndsOn: { type: string, format: date, nullable: true }
 *               noticePeriodDays: { type: integer, nullable: true }
 *               workLocation: { type: string, nullable: true }
 *               phone: { type: string, nullable: true }
 *               personalEmail: { type: string, nullable: true }
 *               dateOfBirth: { type: string, format: date, nullable: true }
 *               gender: { type: string, enum: [MALE, FEMALE, OTHER, UNDISCLOSED], nullable: true }
 *               templateId: { type: string, nullable: true }
 *     responses:
 *       201: { description: Created employee }
 *       409: { description: Email already in use }
 */
onboardingRouter.post(
  '/hrms/onboarding',
  ...manage,
  validateBody(onboardEmployeeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await onboardingService.onboard(actor(req), req.body), 201);
  }),
);

/**
 * @openapi
 * /hrms/onboarding/templates:
 *   get:
 *     summary: Onboarding checklist templates with their tasks
 *     tags: [HRMS Onboarding]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 *   post:
 *     summary: Create an onboarding template
 *     tags: [HRMS Onboarding]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/OnboardingTemplateInput' }
 *     responses:
 *       201: { description: Created }
 * /hrms/onboarding/templates/{id}:
 *   put:
 *     summary: Replace an onboarding template's name, active flag and tasks. Checklists already given to employees are not changed.
 *     tags: [HRMS Onboarding]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/OnboardingTemplateInput' }
 *     responses:
 *       200: { description: OK }
 * components:
 *   schemas:
 *     OnboardingTemplateInput:
 *       type: object
 *       required: [name, tasks]
 *       properties:
 *         name: { type: string }
 *         active: { type: boolean }
 *         tasks:
 *           type: array
 *           items:
 *             type: object
 *             required: [title]
 *             properties:
 *               title: { type: string }
 *               description: { type: string, nullable: true }
 *               owner: { type: string, enum: [HR, MANAGER, EMPLOYEE] }
 *               dueOffsetDays: { type: integer, description: Days after joining (negative = before) }
 */
onboardingRouter.get(
  '/hrms/onboarding/templates',
  ...manage,
  asyncHandler(async (_req: Request, res: Response) => {
    ok(res, await onboardingService.listTemplates());
  }),
);
onboardingRouter.post(
  '/hrms/onboarding/templates',
  ...settings,
  validateBody(upsertTemplateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await onboardingService.createTemplate(actor(req), req.body), 201);
  }),
);
onboardingRouter.put(
  '/hrms/onboarding/templates/:id',
  ...settings,
  validateBody(upsertTemplateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await onboardingService.updateTemplate(actor(req), req.params.id, req.body));
  }),
);

/**
 * @openapi
 * /hrms/employees/{id}/onboarding:
 *   get:
 *     summary: The employee's onboarding checklist with progress
 *     tags: [HRMS Onboarding]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: "{ tasks, total, done }" }
 *   post:
 *     summary: Add an ad-hoc task to the checklist (HR)
 *     tags: [HRMS Onboarding]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title: { type: string }
 *               description: { type: string, nullable: true }
 *               owner: { type: string, enum: [HR, MANAGER, EMPLOYEE] }
 *               dueDate: { type: string, format: date, nullable: true }
 *     responses:
 *       201: { description: Created }
 * /hrms/employees/{id}/onboarding/{taskId}:
 *   patch:
 *     summary: Mark a checklist task done or not done. HR can update any task, the manager MANAGER tasks, the employee their own EMPLOYEE tasks.
 *     tags: [HRMS Onboarding]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: path, name: taskId, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [done]
 *             properties:
 *               done: { type: boolean }
 *     responses:
 *       200: { description: OK }
 */
onboardingRouter.get(
  '/hrms/employees/:id/onboarding',
  ...view,
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await onboardingService.listTasks(actor(req), req.params.id));
  }),
);
onboardingRouter.post(
  '/hrms/employees/:id/onboarding',
  ...manage,
  validateBody(addOnboardingTaskSchema),
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await onboardingService.addTask(actor(req), req.params.id, req.body), 201);
  }),
);
onboardingRouter.patch(
  '/hrms/employees/:id/onboarding/:taskId',
  ...view,
  validateBody(updateOnboardingTaskSchema),
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await onboardingService.updateTask(actor(req), req.params.id, req.params.taskId, req.body));
  }),
);

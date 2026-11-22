import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../../../core/http/asyncHandler';
import { requireAuth } from '../../../core/middleware/requireAuth';
import { requirePermission } from '../../../core/middleware/requirePermission';
import { validateBody, validateQuery } from '../../../core/middleware/validate';
import { PERMISSIONS } from '../../../config/permissions';
import { employeeController } from './controller';
import { listEmployeesQuerySchema, updateEmployeeSchema, updateMyProfileSchema, upsertStatutorySchema } from './dto';

export const employeeRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const view = [requireAuth, requirePermission(PERMISSIONS.HR_EMPLOYEE_VIEW)];
const manage = [requireAuth, requirePermission(PERMISSIONS.HR_EMPLOYEE_MANAGE)];

/**
 * @openapi
 * /hrms/employees:
 *   get:
 *     summary: Employee directory. Results are scoped — Super Admin sees all, HR/Regional Admin their region, everyone else themselves and their reporting tree.
 *     tags: [HRMS Employees]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: departmentId, schema: { type: string } }
 *       - { in: query, name: designationId, schema: { type: string } }
 *       - { in: query, name: regionId, schema: { type: string } }
 *       - { in: query, name: lifecycleStatus, schema: { type: string, enum: [ONBOARDING, PROBATION, CONFIRMED, NOTICE, EXITED] } }
 *       - { in: query, name: employmentType, schema: { type: string, enum: [FULL_TIME, PART_TIME, CONTRACT, INTERN, CONSULTANT] } }
 *       - { in: query, name: includeExited, schema: { type: boolean } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: pageSize, schema: { type: integer } }
 *       - { in: query, name: sortBy, schema: { type: string, enum: [name, joiningDate, createdAt] } }
 *       - { in: query, name: sortOrder, schema: { type: string, enum: [asc, desc] } }
 *     responses:
 *       200: { description: OK }
 */
employeeRouter.get('/hrms/employees', ...view, validateQuery(listEmployeesQuerySchema), asyncHandler(employeeController.list));

/**
 * @openapi
 * /hrms/employees/me:
 *   get:
 *     summary: The caller's own employee record
 *     tags: [HRMS Employees]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 *   patch:
 *     summary: Update the caller's own contact details (phone, personal email, addresses, emergency contact)
 *     tags: [HRMS Employees]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phone: { type: string, nullable: true }
 *               personalEmail: { type: string, nullable: true }
 *               currentAddress: { type: string, nullable: true }
 *               permanentAddress: { type: string, nullable: true }
 *               emergencyContactName: { type: string, nullable: true }
 *               emergencyContactPhone: { type: string, nullable: true }
 *               emergencyContactRel: { type: string, nullable: true }
 *     responses:
 *       200: { description: OK }
 */
employeeRouter.get('/hrms/employees/me', ...view, asyncHandler(employeeController.getMe));
employeeRouter.patch('/hrms/employees/me', ...view, validateBody(updateMyProfileSchema), asyncHandler(employeeController.updateMe));

/**
 * @openapi
 * /hrms/employees/{id}:
 *   get:
 *     summary: One employee (by employee id or employee code such as EMP042), within the caller's scope
 *     tags: [HRMS Employees]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: OK }
 *       404: { description: Not found or outside the caller's scope }
 *   patch:
 *     summary: HR edit of personal and employment details. Department, designation, status and manager changes are recorded in the employment history; EXITED deactivates the login.
 *     tags: [HRMS Employees]
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
 *               phone: { type: string, nullable: true }
 *               personalEmail: { type: string, nullable: true }
 *               currentAddress: { type: string, nullable: true }
 *               permanentAddress: { type: string, nullable: true }
 *               emergencyContactName: { type: string, nullable: true }
 *               emergencyContactPhone: { type: string, nullable: true }
 *               emergencyContactRel: { type: string, nullable: true }
 *               dateOfBirth: { type: string, format: date, nullable: true }
 *               gender: { type: string, enum: [MALE, FEMALE, OTHER, UNDISCLOSED], nullable: true }
 *               designationId: { type: string, nullable: true }
 *               departmentId: { type: string, nullable: true }
 *               reportingToId: { type: string, nullable: true }
 *               employmentType: { type: string, enum: [FULL_TIME, PART_TIME, CONTRACT, INTERN, CONSULTANT] }
 *               lifecycleStatus: { type: string, enum: [ONBOARDING, PROBATION, CONFIRMED, NOTICE, EXITED] }
 *               joiningDate: { type: string, format: date, nullable: true }
 *               probationStartsOn: { type: string, format: date, nullable: true }
 *               probationEndsOn: { type: string, format: date, nullable: true }
 *               confirmedOn: { type: string, format: date, nullable: true }
 *               noticePeriodDays: { type: integer, nullable: true }
 *               exitDate: { type: string, format: date, nullable: true }
 *               workLocation: { type: string, nullable: true }
 *               effectiveDate: { type: string, format: date }
 *               note: { type: string }
 *     responses:
 *       200: { description: OK }
 */
employeeRouter.get('/hrms/employees/:id', ...view, asyncHandler(employeeController.get));
employeeRouter.patch('/hrms/employees/:id', ...manage, validateBody(updateEmployeeSchema), asyncHandler(employeeController.update));

/**
 * @openapi
 * /hrms/employees/{id}/statutory:
 *   get:
 *     summary: Bank and statutory details. Masked for the employee themselves and for HR without hr.employee.sensitive.view.
 *     tags: [HRMS Employees]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: OK }
 *   put:
 *     summary: Set bank and statutory details (stored encrypted). null clears a field, omitted leaves it unchanged.
 *     tags: [HRMS Employees]
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
 *               bankName: { type: string, nullable: true }
 *               bankAccount: { type: string, nullable: true }
 *               ifsc: { type: string, nullable: true }
 *               pan: { type: string, nullable: true }
 *               aadhaar: { type: string, nullable: true }
 *               uan: { type: string, nullable: true }
 *               pfNumber: { type: string, nullable: true }
 *               esiNumber: { type: string, nullable: true }
 *     responses:
 *       200: { description: OK }
 */
employeeRouter.get('/hrms/employees/:id/statutory', ...view, asyncHandler(employeeController.getStatutory));
employeeRouter.put('/hrms/employees/:id/statutory', ...manage, validateBody(upsertStatutorySchema), asyncHandler(employeeController.upsertStatutory));

/**
 * @openapi
 * /hrms/employees/{id}/history:
 *   get:
 *     summary: Employment history (status, department, designation and manager changes), newest first
 *     tags: [HRMS Employees]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: OK }
 */
employeeRouter.get('/hrms/employees/:id/history', ...view, asyncHandler(employeeController.history));

/**
 * @openapi
 * /hrms/employees/{id}/documents:
 *   get:
 *     summary: An employee's HR documents (the employee themselves or HR)
 *     tags: [HRMS Employees]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: OK }
 *   post:
 *     summary: Upload an HR document (PDF, image or Word, max 10 MB)
 *     tags: [HRMS Employees]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, category, title]
 *             properties:
 *               file: { type: string, format: binary }
 *               category: { type: string, enum: [RESUME, OFFER_LETTER, APPOINTMENT_LETTER, ID_PROOF, ADDRESS_PROOF, EDUCATION, EXPERIENCE, POLICY, OTHER] }
 *               title: { type: string }
 *     responses:
 *       201: { description: Created }
 */
employeeRouter.get('/hrms/employees/:id/documents', ...view, asyncHandler(employeeController.listDocuments));
employeeRouter.post('/hrms/employees/:id/documents', ...view, upload.single('file'), asyncHandler(employeeController.uploadDocument));

/**
 * @openapi
 * /hrms/employees/{id}/documents/{documentId}:
 *   get:
 *     summary: Download an HR document
 *     tags: [HRMS Employees]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: path, name: documentId, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: File }
 *   delete:
 *     summary: Remove an HR document (HR only; kept for audit)
 *     tags: [HRMS Employees]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: path, name: documentId, required: true, schema: { type: string } }
 *     responses:
 *       204: { description: Deleted }
 */
employeeRouter.get('/hrms/employees/:id/documents/:documentId', ...view, asyncHandler(employeeController.downloadDocument));
employeeRouter.delete('/hrms/employees/:id/documents/:documentId', ...manage, asyncHandler(employeeController.deleteDocument));

/**
 * @openapi
 * /hrms/employees/{id}/documents/{documentId}/verify:
 *   post:
 *     summary: Mark an HR document as verified (HR only)
 *     tags: [HRMS Employees]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: path, name: documentId, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: OK }
 */
employeeRouter.post('/hrms/employees/:id/documents/:documentId/verify', ...manage, asyncHandler(employeeController.verifyDocument));

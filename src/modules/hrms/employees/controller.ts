import { Request, Response } from 'express';
import { ok } from '../../../core/http/response';
import { BadRequestError, UnauthorizedError } from '../../../core/errors/AppError';
import { employeeService } from './service';
import { ListEmployeesQuery, uploadDocumentSchema } from './dto';

export const employeeController = {
  async list(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    // { items, total, page, pageSize, totalPages } inside `data` — same shape as
    // the users/leads lists, which the web client relies on.
    ok(res, await employeeService.list(req.user, req.query as unknown as ListEmployeesQuery));
  },

  async getMe(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await employeeService.getMe(req.user));
  },

  async updateMe(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await employeeService.updateMe(req.user, req.body));
  },

  async get(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await employeeService.get(req.user, req.params.id));
  },

  async update(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await employeeService.update(req.user, req.params.id, req.body));
  },

  async getStatutory(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await employeeService.getStatutory(req.user, req.params.id));
  },

  async upsertStatutory(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await employeeService.upsertStatutory(req.user, req.params.id, req.body));
  },

  async history(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await employeeService.history(req.user, req.params.id));
  },

  async listDocuments(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await employeeService.listDocuments(req.user, req.params.id));
  },

  async uploadDocument(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    if (!req.file) throw new BadRequestError('No file uploaded');
    const input = uploadDocumentSchema.parse(req.body);
    ok(res, await employeeService.uploadDocument(req.user, req.params.id, req.file, input), 201);
  },

  async downloadDocument(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    const { document, filePath } = await employeeService.getDocumentFile(req.user, req.params.id, req.params.documentId);
    res.setHeader('Content-Type', document.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(document.fileName)}"`);
    res.sendFile(filePath);
  },

  async verifyDocument(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await employeeService.verifyDocument(req.user, req.params.id, req.params.documentId));
  },

  async deleteDocument(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    await employeeService.deleteDocument(req.user, req.params.id, req.params.documentId);
    res.status(204).end();
  },
};

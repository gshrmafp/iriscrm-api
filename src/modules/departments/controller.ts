import { Request, Response } from 'express';
import { ok } from '../../core/http/response';
import { UnauthorizedError } from '../../core/errors/AppError';
import { departmentService } from './service';

export const departmentController = {
  async create(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await departmentService.create(req.user, req.body), 201);
  },

  async list(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await departmentService.list(req.user));
  },

  async get(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await departmentService.get(req.params.id));
  },

  async update(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await departmentService.update(req.params.id, req.user, req.body));
  },

  async addMember(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await departmentService.addMember(req.params.id, req.user, req.body), 201);
  },

  async removeMember(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await departmentService.removeMember(req.params.id, req.user, req.params.userId));
  },
};

import { Request, Response } from 'express';
import { ok } from '../../core/http/response';
import { UnauthorizedError } from '../../core/errors/AppError';
import { customerService } from './service';
import { ListCustomersQuery } from './dto';

export const customerController = {
  async create(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await customerService.create(req.user, req.body), 201);
  },

  async list(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    const filters = req.query as unknown as ListCustomersQuery;
    ok(res, await customerService.list(req.user, filters));
  },

  async get(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await customerService.get(req.params.id, req.user));
  },
};

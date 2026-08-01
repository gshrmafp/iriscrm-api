import { Request, Response } from 'express';
import { ok } from '../../core/http/response';
import { picklistService } from './service';
import { ListPicklistQuery } from './dto';

export const picklistController = {
  async listActive(req: Request, res: Response) {
    const { listType } = req.query as unknown as ListPicklistQuery;
    ok(res, await picklistService.listActive(listType));
  },

  async listAll(req: Request, res: Response) {
    const { listType } = req.query as unknown as ListPicklistQuery;
    ok(res, await picklistService.listAll(listType));
  },

  async create(req: Request, res: Response) {
    ok(res, await picklistService.create(req.body), 201);
  },

  async update(req: Request, res: Response) {
    ok(res, await picklistService.update(req.params.id, req.body));
  },
};

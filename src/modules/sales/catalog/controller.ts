import { Request, Response } from 'express';
import { ok } from '../../../core/http/response';
import { UnauthorizedError } from '../../../core/errors/AppError';
import { catalogService } from './service';
import { ListCatalogItemsQuery } from './dto';

export const catalogController = {
  async list(req: Request, res: Response) {
    const filters = req.query as unknown as ListCatalogItemsQuery;
    ok(res, await catalogService.listItems(filters));
  },

  async create(req: Request, res: Response) {
    ok(res, await catalogService.createItem(req.body), 201);
  },

  async update(req: Request, res: Response) {
    ok(res, await catalogService.updateItem(req.params.id, req.body));
  },

  async createPriceRule(req: Request, res: Response) {
    ok(res, await catalogService.createPriceRule(req.body), 201);
  },

  async resolvePrice(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    const regionId = (req.query.regionId as string) ?? req.user.regionId;
    ok(res, await catalogService.resolvePrice(req.params.id, regionId));
  },
};

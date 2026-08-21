import { Request, Response } from 'express';
import { ok } from '../../core/http/response';
import { UnauthorizedError } from '../../core/errors/AppError';
import { identityService } from './service';
import { ListUsersQuery } from './dto';

export const identityController = {
  async login(req: Request, res: Response) {
    const result = await identityService.login(req.body);
    ok(res, result);
  },

  async refresh(req: Request, res: Response) {
    const result = await identityService.refresh(req.body.refreshToken);
    ok(res, result);
  },

  async listRegions(_req: Request, res: Response) {
    const regions = await identityService.listRegions();
    ok(res, regions);
  },

  async createRegion(req: Request, res: Response) {
    const region = await identityService.createRegion(req.body);
    ok(res, region, 201);
  },

  async updateRegion(req: Request, res: Response) {
    const region = await identityService.updateRegion(req.params.id, req.body);
    ok(res, region);
  },

  async createUser(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    const user = await identityService.createUser(req.user, req.body);
    ok(res, user, 201);
  },

  async listUsers(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    const filters = req.query as unknown as ListUsersQuery;
    const users = await identityService.listUsers(req.user, filters);
    ok(res, users);
  },

  async listUserDirectory(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    const users = await identityService.listUserDirectory(req.user);
    ok(res, users);
  },

  async getEffectivePermissions(req: Request, res: Response) {
    const result = await identityService.getEffectivePermissions(req.params.id);
    ok(res, result);
  },

  async setPermissionOverride(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    const result = await identityService.setPermissionOverride(req.user, req.params.id, req.body);
    ok(res, result, 201);
  },

  async removePermissionOverride(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    await identityService.removePermissionOverride(req.user, req.params.id, req.params.permissionKey);
    res.status(204).send();
  },

  async updateUserStatus(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    const user = await identityService.updateUserStatus(req.user, req.params.id, req.body);
    ok(res, user);
  },

  async getUser(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    const user = await identityService.getUser(req.user, req.params.id);
    ok(res, user);
  },

  async updateUser(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    const user = await identityService.updateUser(req.user, req.params.id, req.body);
    ok(res, user);
  },
};

import { Request, Response } from 'express';
import { ok } from '../../../core/http/response';
import { UnauthorizedError } from '../../../core/errors/AppError';
import { entityCommentService } from '../../comments/service';
import { leadService } from './service';
import { LeadStatusSummaryQuery, ListLeadFollowUpsQuery, ListLeadsQuery } from './dto';

export const leadController = {
  async create(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    const result = await leadService.create(req.user, req.body);
    ok(res, result, 201);
  },

  async list(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    const filters = req.query as unknown as ListLeadsQuery;
    ok(res, await leadService.list(req.user, filters));
  },

  async get(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await leadService.get(req.params.id, req.user));
  },

  async statusSummary(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    const { ownerId } = req.query as unknown as LeadStatusSummaryQuery;
    ok(res, await leadService.statusSummary(req.user, ownerId));
  },

  async listFollowUps(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    const filters = req.query as unknown as ListLeadFollowUpsQuery;
    ok(res, await leadService.listFollowUps(req.user, filters));
  },

  async addFollowUp(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await leadService.addFollowUp(req.params.id, req.user, req.body), 201);
  },

  async markLost(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await leadService.markLost(req.params.id, req.user, req.body));
  },

  async qualify(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await leadService.qualify(req.params.id, req.user, req.body), 201);
  },

  async listComments(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await entityCommentService.list('LEAD', req.params.id, req.user));
  },

  async addComment(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await entityCommentService.create('LEAD', req.params.id, req.user, req.body), 201);
  },

  async updateComment(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(
      res,
      await entityCommentService.update('LEAD', req.params.id, req.params.commentId, req.user, req.body.body),
    );
  },

  async deleteComment(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await entityCommentService.remove('LEAD', req.params.id, req.params.commentId, req.user));
  },
};

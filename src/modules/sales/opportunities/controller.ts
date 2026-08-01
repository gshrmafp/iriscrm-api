import { Request, Response } from 'express';
import { ok } from '../../../core/http/response';
import { UnauthorizedError } from '../../../core/errors/AppError';
import { entityCommentService } from '../../comments/service';
import { opportunityService } from './service';
import { ListOpportunitiesQuery } from './dto';

export const opportunityController = {
  async list(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    const filters = req.query as unknown as ListOpportunitiesQuery;
    ok(res, await opportunityService.list(req.user, filters));
  },

  async getPipelineSummary(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await opportunityService.getPipelineSummary(req.user));
  },

  async get(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await opportunityService.get(req.params.id, req.user));
  },

  async transitionStage(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await opportunityService.transitionStage(req.params.id, req.user, req.body));
  },

  async reassign(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await opportunityService.reassign(req.params.id, req.user, req.body));
  },

  async markLost(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await opportunityService.markLost(req.params.id, req.user, req.body.reason));
  },

  async win(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await opportunityService.win(req.params.id, req.user, req.body));
  },

  async listComments(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await entityCommentService.list('OPPORTUNITY', req.params.id, req.user));
  },

  async addComment(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await entityCommentService.create('OPPORTUNITY', req.params.id, req.user, req.body), 201);
  },

  async updateComment(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(
      res,
      await entityCommentService.update(
        'OPPORTUNITY',
        req.params.id,
        req.params.commentId,
        req.user,
        req.body.body,
      ),
    );
  },

  async deleteComment(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await entityCommentService.remove('OPPORTUNITY', req.params.id, req.params.commentId, req.user));
  },
};

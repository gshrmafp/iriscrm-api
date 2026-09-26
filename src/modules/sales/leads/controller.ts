import { Request, Response } from 'express';
import { ok } from '../../../core/http/response';
import { UnauthorizedError } from '../../../core/errors/AppError';
import { entityCommentService } from '../../comments/service';
import { leadService } from './service';
import {
  JourneySummaryQuery,
  LeadStatusSummaryQuery,
  ListLeadFollowUpsQuery,
  ListLeadsQuery,
  TeamPerformanceQuery,
} from './dto';

export const leadController = {
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

  async journeySummary(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    const filters = req.query as unknown as JourneySummaryQuery;
    ok(res, await leadService.journeySummary(req.user, filters));
  },

  async teamPerformance(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    const filters = req.query as unknown as TeamPerformanceQuery;
    ok(res, await leadService.teamPerformance(req.user, filters));
  },

  async listFollowUps(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    const filters = req.query as unknown as ListLeadFollowUpsQuery;
    ok(res, await leadService.listFollowUps(req.user, filters));
  },

  async dashboardSummary(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    const { ownerId } = req.query as unknown as LeadStatusSummaryQuery;
    ok(res, await leadService.dashboardSummary(req.user, ownerId));
  },

  async addFollowUp(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await leadService.addFollowUp(req.params.id, req.user, req.body), 201);
  },

  async completeFollowUp(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await leadService.completeFollowUp(req.params.followUpId, req.user));
  },

  async addMeeting(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await leadService.addMeeting(req.params.id, req.user, req.body), 201);
  },

  // Stepped lead creation
  async createStepped(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await leadService.createStepped(req.user, req.body), 201);
  },

  async saveStep2(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await leadService.saveStep2(req.params.id, req.user, req.body));
  },

  async saveStep3(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    const result = await leadService.saveStep3(req.params.id, req.user, req.body);
    ok(res, result, result.opportunity ? 201 : 200);
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

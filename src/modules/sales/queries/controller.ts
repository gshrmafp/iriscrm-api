import { Request, Response } from "express";
import { ok } from "../../../core/http/response";
import {
  BadRequestError,
  UnauthorizedError,
} from "../../../core/errors/AppError";
import { queryService } from "./service";
import { ListFollowUpsQuery, ListSalesQueriesQuery, ReportQuery } from "./dto";

function csvResponse(res: Response, filename: string, csv: string) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
}

export const salesQueryController = {
  async create(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await queryService.create(req.user, req.body), 201);
  },

  async list(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    const filters = req.query as unknown as ListSalesQueriesQuery;
    ok(res, await queryService.list(req.user, filters));
  },

  async get(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await queryService.get(req.params.id, req.user));
  },

  async update(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await queryService.update(req.params.id, req.user, req.body));
  },

  async assignDepartment(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(
      res,
      await queryService.assignDepartment(req.params.id, req.user, req.body),
    );
  },

  async reassignOwner(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(
      res,
      await queryService.reassignOwner(req.params.id, req.user, req.body),
    );
  },

  async transitionStatus(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(
      res,
      await queryService.transitionStatus(req.params.id, req.user, req.body),
    );
  },

  async listComments(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    const query = (await queryService.get(req.params.id, req.user)) as any;
    ok(res, query.comments);
  },

  async addComment(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(
      res,
      await queryService.addComment(req.params.id, req.user, req.body),
      201,
    );
  },

  async updateComment(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(
      res,
      await queryService.updateComment(
        req.params.id,
        req.params.commentId,
        req.user,
        req.body.body,
      ),
    );
  },

  async deleteComment(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(
      res,
      await queryService.deleteComment(
        req.params.id,
        req.params.commentId,
        req.user,
      ),
    );
  },

  async pinComment(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(
      res,
      await queryService.pinComment(
        req.params.id,
        req.params.commentId,
        req.user,
        req.body.isPinned,
      ),
    );
  },

  async uploadAttachment(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    if (!req.file) throw new BadRequestError("No file uploaded");
    ok(
      res,
      await queryService.addAttachment(
        req.params.id,
        req.user,
        req.file,
        req.body.commentId,
      ),
      201,
    );
  },

  async downloadAttachment(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    const { attachment, filePath } = await queryService.getAttachmentFilePath(
      req.params.id,
      req.params.attachmentId,
      req.user,
    );
    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${attachment.fileName}"`,
    );
    res.sendFile(filePath);
  },

  async addFollowUp(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(
      res,
      await queryService.addFollowUp(req.params.id, req.user, req.body),
      201,
    );
  },

  async listFollowUps(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    const filters = req.query as unknown as ListFollowUpsQuery;
    ok(res, await queryService.listFollowUps(req.params.id, req.user, filters));
  },

  async updateFollowUp(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(
      res,
      await queryService.updateFollowUp(
        req.params.id,
        req.params.followUpId,
        req.user,
        req.body,
      ),
    );
  },

  async completeFollowUp(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(
      res,
      await queryService.completeFollowUp(
        req.params.id,
        req.params.followUpId,
        req.user,
        req.body.customerResponse,
        req.body.outcome,
      ),
    );
  },

  async rescheduleFollowUp(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(
      res,
      await queryService.rescheduleFollowUp(
        req.params.id,
        req.params.followUpId,
        req.user,
        req.body.scheduledAt,
        req.body.note,
        req.body.reminderMinutes,
      ),
    );
  },

  async cancelFollowUp(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(
      res,
      await queryService.cancelFollowUp(
        req.params.id,
        req.params.followUpId,
        req.user,
      ),
    );
  },

  async getDashboard(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await queryService.getDashboard(req.user));
  },

  async runReport(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    const params = req.query as unknown as ReportQuery;
    const result = await queryService.runReport(req.user, params);
    if (
      params.format === "csv" &&
      typeof result === "object" &&
      (result as any).csv
    ) {
      return csvResponse(res, `${params.reportType}.csv`, (result as any).csv);
    }
    ok(res, result);
  },
};

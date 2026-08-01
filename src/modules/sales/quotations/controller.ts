import { Request, Response } from "express";
import { ok } from "../../../core/http/response";
import { UnauthorizedError } from "../../../core/errors/AppError";
import { quotationService } from "./service";

export const quotationController = {
  async create(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await quotationService.create(req.user, req.body), 201);
  },

  async revise(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(
      res,
      await quotationService.revise(req.user, req.params.id, req.body),
      201,
    );
  },

  async submit(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await quotationService.submit(req.user, req.params.id));
  },

  async approve(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await quotationService.approve(req.user, req.params.id));
  },

  async reject(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await quotationService.reject(req.params.id));
  },

  async send(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await quotationService.send(req.params.id));
  },

  async listForOpportunity(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    ok(
      res,
      await quotationService.listForOpportunity(
        req.params.opportunityId,
        req.user,
      ),
    );
  },
};

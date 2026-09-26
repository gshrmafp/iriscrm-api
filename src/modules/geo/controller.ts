import { Request, Response } from 'express';
import { ok } from '../../core/http/response';
import { UnauthorizedError } from '../../core/errors/AppError';
import { geoService } from './service';
import { ForwardGeocodeQuery, ReverseGeocodeQuery } from './dto';

export const geoController = {
  async reverseGeocode(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    const { lat, lng } = req.query as unknown as ReverseGeocodeQuery;
    ok(res, await geoService.reverseGeocode(lat, lng));
  },

  async forwardGeocode(req: Request, res: Response) {
    if (!req.user) throw new UnauthorizedError();
    const { q } = req.query as unknown as ForwardGeocodeQuery;
    ok(res, await geoService.forwardGeocode(q));
  },
};

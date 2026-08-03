import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/middleware/requireAuth';
import { validateQuery } from '../../core/middleware/validate';
import { geoController } from './controller';
import { reverseGeocodeQuerySchema } from './dto';

export const geoRouter = Router();

/**
 * @openapi
 * /geo/reverse-geocode:
 *   get:
 *     summary: Reverse-geocode a lat/lng pair into a human-readable address label (proxies OSM Nominatim)
 *     tags: [Geo]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema: { type: number, example: 28.4595 }
 *       - in: query
 *         name: lng
 *         required: true
 *         schema: { type: number, example: 77.0266 }
 *     responses:
 *       200: { description: OK }
 */
geoRouter.get(
  '/geo/reverse-geocode',
  requireAuth,
  validateQuery(reverseGeocodeQuerySchema),
  asyncHandler(geoController.reverseGeocode),
);

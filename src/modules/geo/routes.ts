import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/middleware/requireAuth';
import { validateQuery } from '../../core/middleware/validate';
import { geoController } from './controller';
import { forwardGeocodeQuerySchema, reverseGeocodeQuerySchema } from './dto';

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

/**
 * @openapi
 * /geo/forward-geocode:
 *   get:
 *     summary: Forward-geocode a typed address into a lat/lng pair (proxies OSM Nominatim) — used when GPS is unavailable and the address is entered manually
 *     tags: [Geo]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string, example: "Sector 21, Gurugram" }
 *     responses:
 *       200: { description: "{ lat, lng, address } or null if no match" }
 */
geoRouter.get(
  '/geo/forward-geocode',
  requireAuth,
  validateQuery(forwardGeocodeQuerySchema),
  asyncHandler(geoController.forwardGeocode),
);

import { z } from 'zod';

export const reverseGeocodeQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});
export type ReverseGeocodeQuery = z.infer<typeof reverseGeocodeQuerySchema>;

export const forwardGeocodeQuerySchema = z.object({
  q: z.string().min(1, 'A search query is required'),
});
export type ForwardGeocodeQuery = z.infer<typeof forwardGeocodeQuerySchema>;

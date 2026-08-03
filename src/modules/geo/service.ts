import { BadRequestError } from '../../core/errors/AppError';

// Reverse geocoding is proxied server-side (rather than called directly from
// the browser) for two reasons: OSM Nominatim's usage policy requires a
// real, identifying User-Agent header (browsers can't set one on fetch),
// and CORS on nominatim.org is unreliable for arbitrary origins.
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';

interface NominatimResponse {
  display_name?: string;
  error?: string;
}

export const geoService = {
  async reverseGeocode(lat: number, lng: number): Promise<{ address: string | null }> {
    const url = `${NOMINATIM_URL}?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=0`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'IRIS-CRM/1.0 (internal sales tool)' },
        signal: controller.signal,
      });
      if (!response.ok) throw new BadRequestError('Reverse geocoding lookup failed');
      const data = (await response.json()) as NominatimResponse;
      return { address: data.display_name ?? null };
    } catch (error) {
      if (error instanceof BadRequestError) throw error;
      // Network hiccups / timeouts shouldn't block lead capture — the raw
      // GPS coordinates are already captured and saved regardless.
      return { address: null };
    } finally {
      clearTimeout(timeout);
    }
  },
};

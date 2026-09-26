import { BadRequestError } from '../../core/errors/AppError';

// Reverse geocoding is proxied server-side (rather than called directly from
// the browser) for two reasons: OSM Nominatim's usage policy requires a
// real, identifying User-Agent header (browsers can't set one on fetch),
// and CORS on nominatim.org is unreliable for arbitrary origins.
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';

interface NominatimResponse {
  display_name?: string;
  error?: string;
}

interface NominatimSearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

export const geoService = {
  async reverseGeocode(lat: number, lng: number): Promise<{ address: string | null }> {
    const url = `${NOMINATIM_REVERSE_URL}?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=0`;
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

  // Forward geocode — turns a manually-typed address into a lat/lng pair, for
  // when the browser/device can't get a real GPS fix (denied permission, no
  // hardware, indoors) but the lead still needs coordinates saved alongside
  // the address label.
  async forwardGeocode(query: string): Promise<{ lat: number; lng: number; address: string } | null> {
    const url = `${NOMINATIM_SEARCH_URL}?format=jsonv2&q=${encodeURIComponent(query)}&limit=1`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'IRIS-CRM/1.0 (internal sales tool)' },
        signal: controller.signal,
      });
      if (!response.ok) throw new BadRequestError('Forward geocoding lookup failed');
      const data = (await response.json()) as NominatimSearchResult[];
      const best = data[0];
      if (!best) return null;
      return { lat: parseFloat(best.lat), lng: parseFloat(best.lon), address: best.display_name };
    } catch (error) {
      if (error instanceof BadRequestError) throw error;
      return null;
    } finally {
      clearTimeout(timeout);
    }
  },
};

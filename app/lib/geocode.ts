'use client';

/**
 * Geocode a free-form address to lat/lng via Nominatim (OpenStreetMap).
 *
 * Nominatim is free, no API key, but rate-limited to 1 request per second
 * and asks callers to identify themselves. A POS looking up an address
 * every few minutes is well under that limit.
 *
 * Returns null if the address didn't resolve. The caller can then surface
 * a "check spelling" error instead of blindly submitting.
 */
export async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  const query = address.trim();
  if (!query) return null;

  const url =
    'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' +
    encodeURIComponent(query);

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      // Fail fast if network is dead so we don't hang the submit button.
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!Array.isArray(data) || data.length === 0) return null;
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

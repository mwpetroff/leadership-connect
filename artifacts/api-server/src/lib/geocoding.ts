/**
 * Server-side geocoding via Nominatim (OpenStreetMap).
 *
 * Requests are serialised at 1.1s intervals to respect Nominatim's
 * 1-req/s policy. Results are only stored in the DB (no in-process cache
 * needed — callers persist the result immediately after resolving).
 */

const DELAY_MS = 1100;

export interface LatLng {
  lat: number;
  lng: number;
}

let queue = Promise.resolve();

function schedule<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(() =>
    fn().then((v) => new Promise<T>((resolve) => setTimeout(() => resolve(v), DELAY_MS)))
  );
  queue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

async function nominatim(query: string): Promise<LatLng | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=us`;
    const res = await fetch(url, {
      headers: {
        "Accept-Language": "en",
        "User-Agent": "LeadershipConnect/1.0",
      },
    });
    const data = await res.json() as Array<{ lat: string; lon: string }>;
    if (data[0]) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch {
    // network failure — return null
  }
  return null;
}

/**
 * Geocodes a city + state string server-side.
 * Returns null if the city/state is empty or Nominatim can't find it.
 * All calls are rate-limited through a shared queue.
 */
export async function geocodeCity(city: string | null | undefined, state: string | null | undefined): Promise<LatLng | null> {
  const key = [city, state].filter(Boolean).join(", ");
  if (!key) return null;
  return schedule(() => nominatim(key));
}

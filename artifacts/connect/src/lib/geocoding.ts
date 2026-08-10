/**
 * Client-side geocoding via the free Nominatim API (OpenStreetMap).
 *
 * Results are cached in localStorage so each city is only fetched once
 * across page loads. Requests are serialised at 350 ms intervals to
 * stay well within Nominatim's 1-req/s policy.
 */

const CACHE_KEY = "lc_geocache_v1";
const DELAY_MS = 1100; // Nominatim policy: ≤ 1 request per second

type LatLng = { lat: number; lng: number };
type Cache = Record<string, LatLng | null>; // null = "not found"

function loadCache(): Cache {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveCache(cache: Cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // storage full — ignore
  }
}

let queue = Promise.resolve();

function schedule<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(() => fn()).then((v) => {
    return new Promise<T>((resolve) =>
      setTimeout(() => resolve(v), DELAY_MS)
    );
  });
  queue = next.then(() => undefined, () => undefined);
  return next;
}

async function nominatim(query: string): Promise<LatLng | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=us`;
    const res = await fetch(url, {
      headers: { "Accept-Language": "en", "User-Agent": "LeadershipConnect/1.0" },
    });
    const data: Array<{ lat: string; lon: string }> = await res.json();
    if (data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    // network failure — return null
  }
  return null;
}

/**
 * Geocodes a "City, State" string. Returns cached result immediately if
 * available; otherwise queues a Nominatim request.
 */
export async function geocode(city: string | null, state: string | null): Promise<LatLng | null> {
  if (!city && !state) return null;

  const key = [city, state].filter(Boolean).join(", ");
  const cache = loadCache();

  if (key in cache) return cache[key];

  return schedule(async () => {
    const result = await nominatim(key);
    const fresh = loadCache();
    fresh[key] = result;
    saveCache(fresh);
    return result;
  });
}

/**
 * Geocodes a list of unique location strings in one batch, respecting rate limits.
 */
export async function geocodeBatch(
  locations: Array<{ city: string | null; state: string | null }>
): Promise<Map<string, LatLng | null>> {
  const unique = new Map<string, { city: string | null; state: string | null }>();
  for (const loc of locations) {
    const key = [loc.city, loc.state].filter(Boolean).join(", ");
    if (key) unique.set(key, loc);
  }

  const cache = loadCache();
  const missing: string[] = [];
  for (const key of unique.keys()) {
    if (!(key in cache)) missing.push(key);
  }

  // Fire off all missing lookups via the rate-limited queue
  await Promise.all(
    missing.map((key) => {
      const loc = unique.get(key)!;
      return geocode(loc.city, loc.state);
    })
  );

  // Re-read cache after all fetches
  const final = loadCache();
  const result = new Map<string, LatLng | null>();
  for (const key of unique.keys()) {
    result.set(key, final[key] ?? null);
  }
  return result;
}

export function locationKey(city: string | null, state: string | null): string {
  return [city, state].filter(Boolean).join(", ");
}

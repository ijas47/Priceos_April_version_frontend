/**
 * Lightweight geocoding via OpenStreetMap Nominatim.
 *
 * No API key required and global coverage — fits the "works for any city,
 * not just Dubai" requirement. Results are cached in-process and callers
 * should persist the coordinates on the listing so we geocode each property
 * at most once.
 *
 * Nominatim usage policy asks for a descriptive User-Agent and low request
 * volume; we only call this on connect / first comp fetch, never per-request.
 */

export interface GeoPoint {
    lat: number;
    lng: number;
}

export interface GeoBounds {
    ne_lat: number;
    ne_lng: number;
    sw_lat: number;
    sw_lng: number;
}

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const cache = new Map<string, GeoPoint | null>();

/**
 * Resolve a free-text address (plus city/country fallback) to lat/lng.
 * Returns null when nothing usable can be geocoded.
 */
export async function geocode(
    address: string | undefined,
    city: string | undefined,
    countryCode: string | undefined,
): Promise<GeoPoint | null> {
    const query = [address, city, countryCode].filter(Boolean).join(", ").trim();
    if (!query) return null;

    const cacheKey = query.toLowerCase();
    if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

    const url = new URL(NOMINATIM);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
        const res = await fetch(url.toString(), {
            headers: { "User-Agent": "PriceOS/1.0 (revenue management; contact: support@priceos.app)" },
            signal: controller.signal,
        });
        if (!res.ok) {
            cache.set(cacheKey, null);
            return null;
        }
        const data = (await res.json()) as Array<{ lat?: string; lon?: string }>;
        const first = data[0];
        if (!first?.lat || !first?.lon) {
            cache.set(cacheKey, null);
            return null;
        }
        const point: GeoPoint = { lat: parseFloat(first.lat), lng: parseFloat(first.lon) };
        if (Number.isNaN(point.lat) || Number.isNaN(point.lng)) {
            cache.set(cacheKey, null);
            return null;
        }
        cache.set(cacheKey, point);
        return point;
    } catch (err) {
        console.error("[geocode]", (err as Error).message);
        cache.set(cacheKey, null);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Build a bounding box of roughly `radiusKm` around a point. Longitude degrees
 * are scaled by latitude so the box stays ~square in real distance at any
 * latitude on Earth (global-safe, not tuned to one city).
 */
export function boundsAround(point: GeoPoint, radiusKm = 4): GeoBounds {
    const latDelta = radiusKm / 111; // ~111 km per degree of latitude
    const cosLat = Math.cos((point.lat * Math.PI) / 180);
    const lngDelta = radiusKm / (111 * Math.max(0.01, Math.abs(cosLat)));
    return {
        ne_lat: point.lat + latDelta,
        ne_lng: point.lng + lngDelta,
        sw_lat: point.lat - latDelta,
        sw_lng: point.lng - lngDelta,
    };
}

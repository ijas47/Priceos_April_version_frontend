/**
 * Airbtics market context - cached aggregation of summary, metrics,
 * and future-pacing data for a given market + bedroom count.
 *
 * In-memory cache with configurable TTLs. Falls back gracefully
 * when the API key is missing or calls fail.
 */

import * as client from "./client";

// ── In-memory cache ────────────────────────────────────────────────────────

const cache = new Map<string, { data: unknown; expiresAt: number }>();

async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T | null> {
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.data as T;
    try {
        const data = await fn();
        cache.set(key, { data, expiresAt: Date.now() + ttlMs });
        return data;
    } catch (err) {
        console.error(`[Airbtics cache miss] ${key}:`, (err as Error).message);
        // Return stale data if available
        if (hit) return hit.data as T;
        return null;
    }
}

// ── TTLs ───────────────────────────────────────────────────────────────────

const TTL_SUMMARY = 24 * 60 * 60 * 1000; // 24h
const TTL_METRICS = 12 * 60 * 60 * 1000; // 12h
const TTL_PACING = 6 * 60 * 60 * 1000;   // 6h
const TTL_COMPS = 24 * 60 * 60 * 1000;   // 24h

// ── Public types ───────────────────────────────────────────────────────────

export interface MarketContext {
    marketId: string;
    bedrooms: string;
    summary: client.MarketSummary | null;
    monthlyMetrics: client.MonthlyMetric[];
    futurePacing: client.PacingDay[];
    p50ADR: number | null;
    occupancy: number | null;
    activeListings: number | null;
    fetchedAt: string;
    errors: string[];
}

export interface CompSet {
    listings: client.CompListing[];
    fetchedAt: string;
    error?: string;
}

// ── Core functions ─────────────────────────────────────────────────────────

export async function getMarketContext(
    marketId: string,
    bedrooms: string | number
): Promise<MarketContext> {
    const br = String(bedrooms);
    const errors: string[] = [];

    if (!client.isAvailable()) {
        return {
            marketId, bedrooms: br, summary: null, monthlyMetrics: [],
            futurePacing: [], p50ADR: null, occupancy: null, activeListings: null,
            fetchedAt: new Date().toISOString(),
            errors: ["AIRBTICS_API_KEY not set"],
        };
    }

    const [summary, metricsRes, pacingRes] = await Promise.all([
        cached<client.MarketSummary>(
            `airbtics:summary:${marketId}:${br}`,
            TTL_SUMMARY,
            () => client.getMarketSummary(marketId, br)
        ),
        cached<{ metrics?: client.MonthlyMetric[] }>(
            `airbtics:metrics:${marketId}:${br}`,
            TTL_METRICS,
            () => client.getMarketMetrics(marketId, br)
        ),
        cached<{ pacing?: client.PacingDay[] }>(
            `airbtics:pacing:${marketId}:${br}`,
            TTL_PACING,
            () => client.getFuturePacing(marketId, br)
        ),
    ]);

    if (!summary) errors.push("summary fetch failed");
    if (!metricsRes) errors.push("monthly metrics fetch failed");
    if (!pacingRes) errors.push("future pacing fetch failed");

    return {
        marketId,
        bedrooms: br,
        summary: summary ?? null,
        monthlyMetrics: metricsRes?.metrics ?? [],
        futurePacing: pacingRes?.pacing ?? [],
        p50ADR: summary?.average_daily_rate ?? null,
        occupancy: summary?.occupancy ?? null,
        activeListings: summary?.active_listings_count ?? null,
        fetchedAt: new Date().toISOString(),
        errors,
    };
}

export async function getCompSet(
    bounds: { ne_lat: number; ne_lng: number; sw_lat: number; sw_lng: number },
    bedrooms: number
): Promise<CompSet> {
    if (!client.isAvailable()) {
        return { listings: [], fetchedAt: new Date().toISOString(), error: "AIRBTICS_API_KEY not set" };
    }

    const key = `airbtics:comps:${bounds.sw_lat.toFixed(3)}_${bounds.sw_lng.toFixed(3)}_${bounds.ne_lat.toFixed(3)}_${bounds.ne_lng.toFixed(3)}:${bedrooms}`;
    const result = await cached<{ listings?: client.CompListing[] }>(
        key,
        TTL_COMPS,
        () => client.searchListingsByBounds(bounds, bedrooms)
    );

    return {
        listings: result?.listings ?? [],
        fetchedAt: new Date().toISOString(),
        error: result ? undefined : "comp set fetch failed",
    };
}

function isDubaiMarket(city: string, countryCode: string): boolean {
    const c = city.trim().toLowerCase();
    const cc = countryCode.trim().toUpperCase();
    return c === "dubai" && (cc === "AE" || cc === "UAE" || cc === "ARE");
}

/** Known market IDs when /markets/search returns nothing (Dubai = 2286 per Airbtics). */
function knownMarketFallback(city: string, countryCode: string): string | null {
    if (!isDubaiMarket(city, countryCode)) return null;
    const fromEnv = process.env.AIRBTICS_DUBAI_MARKET_ID?.trim();
    return fromEnv || "2286";
}

/**
 * Resolve a city/country to an Airbtics market ID.
 * Searches the Airbtics market directory and caches the result permanently.
 * Falls back to AIRBTICS_DUBAI_MARKET_ID (default 2286) for Dubai when search fails -
 * same fallback used by /api/agent-tools/market-overview.
 */
export async function resolveMarketId(
    city: string,
    countryCode: string
): Promise<string | null> {
    const key = `airbtics:marketId:${city.toLowerCase()}:${countryCode.toLowerCase()}`;
    const hit = cache.get(key);
    if (hit) return hit.data as string;

    if (!client.isAvailable()) return knownMarketFallback(city, countryCode);

    try {
        const result = await client.searchMarket(city, countryCode);
        const markets = result?.markets ?? [];
        if (markets.length === 0) {
            const fallback = knownMarketFallback(city, countryCode);
            if (fallback) {
                console.warn(
                    `[Airbtics] no search results for ${city}/${countryCode} - using market ${fallback}`
                );
                cache.set(key, { data: fallback, expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000 });
                return fallback;
            }
            return null;
        }
        const id = String(markets[0].market_id);
        cache.set(key, { data: id, expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000 });
        return id;
    } catch (err) {
        const fallback = knownMarketFallback(city, countryCode);
        if (fallback) {
            console.warn(
                `[Airbtics] market search failed for ${city}/${countryCode} (${(err as Error).message}) - using ${fallback}`
            );
            cache.set(key, { data: fallback, expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000 });
            return fallback;
        }
        console.error(`[Airbtics] market search failed for ${city}/${countryCode}:`, (err as Error).message);
        return null;
    }
}

/**
 * Airbtics API client - all HTTP calls go through here.
 *
 * Auth: x-api-key header.
 * Base URL: https://crap0y5bx5.execute-api.us-east-2.amazonaws.com/prod
 *
 * Env: AIRBTICS_API_KEY (required)
 */

const BASE = "https://crap0y5bx5.execute-api.us-east-2.amazonaws.com/prod";

function getKey(): string | undefined {
    const v = process.env.AIRBTICS_API_KEY;
    return v && v.trim() ? v.trim() : undefined;
}

async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const key = getKey();
    if (!key) throw new Error("AIRBTICS_API_KEY not set");

    const url = new URL(`${BASE}${path}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
        const res = await fetch(url.toString(), {
            headers: { "x-api-key": key },
            signal: controller.signal,
        });
        if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new Error(`Airbtics ${res.status}: ${path} - ${body.slice(0, 200)}`);
        }
        return (await res.json()) as T;
    } finally {
        clearTimeout(timer);
    }
}

async function post<T>(path: string, body: unknown): Promise<T> {
    const key = getKey();
    if (!key) throw new Error("AIRBTICS_API_KEY not set");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
        const res = await fetch(`${BASE}${path}`, {
            method: "POST",
            headers: {
                "x-api-key": key,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`Airbtics ${res.status}: ${path} - ${text.slice(0, 200)}`);
        }
        return (await res.json()) as T;
    } finally {
        clearTimeout(timer);
    }
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface MarketSearchResult {
    market_id: number;
    name: string;
    country_code: string;
    [k: string]: unknown;
}

export interface MarketSummary {
    average_daily_rate: number;
    occupancy: number;
    revenue: number;
    active_listings_count: number;
    [k: string]: unknown;
}

export interface MonthlyMetric {
    month: string;
    p25_adr?: number;
    p50_adr?: number;
    p75_adr?: number;
    occupancy?: number;
    revenue_yoy_change_pct?: number;
    [k: string]: unknown;
}

export interface PacingDay {
    date: string;
    occupancy: number;
    adr: number;
    vs_ly_occupancy?: number;
    [k: string]: unknown;
}

export interface CompListing {
    listing_id?: string;
    name?: string;
    ltm_occupancy?: number;
    ltm_adr?: number;
    ltm_revenue?: number;
    bedrooms?: number;
    rating?: number;
    reviews?: number;
    url?: string;
    [k: string]: unknown;
}

export function isAvailable(): boolean {
    return !!getKey();
}

export function searchMarket(query: string, countryCode: string) {
    return get<{ markets?: MarketSearchResult[] }>("/markets/search", {
        query,
        country_code: countryCode,
    });
}

export function getMarketSummary(marketId: string, bedrooms: string) {
    return get<MarketSummary>("/markets/summary", {
        market_id: marketId,
        bedrooms,
    });
}

export function getMarketMetrics(marketId: string, bedrooms: string, months = "12") {
    return get<{ metrics?: MonthlyMetric[] }>("/markets/metrics/all", {
        market_id: marketId,
        bedrooms,
        number_of_months: months,
    });
}

export function getFuturePacing(marketId: string, bedrooms: string) {
    return get<{ pacing?: PacingDay[] }>("/markets/metrics/future-pacing", {
        market_id: marketId,
        bedrooms,
    });
}

export function searchListingsByBounds(
    bounds: { ne_lat: number; ne_lng: number; sw_lat: number; sw_lng: number },
    bedrooms: number
) {
    return post<{ listings?: CompListing[] }>("/listings/search/bounds", {
        bounds,
        bedrooms,
        page: 1,
    });
}

export function generateRevenueReport(lat: number, lng: number, bedrooms: number) {
    return post<{ report_id?: string }>("/report/all", {
        latitude: lat,
        longitude: lng,
        bedrooms,
    });
}

export function getReport(reportId: string) {
    return get<Record<string, unknown>>("/report", { report_id: reportId });
}

/**
 * Structured research sources — SERP API (Google Events / News / Search),
 * Ticketmaster Discovery, Eventbrite, NewsAPI.
 *
 * These return VERIFIABLE, structured data. They are always preferred over
 * LLM-based research (Perplexity), which is only used as a last-resort
 * synthesizer and is capped at low confidence.
 *
 * Env keys (all optional — each source skips cleanly when unset):
 *   SERP_API_KEY          serpapi.com
 *   TICKETMASTER_API_KEY  developer.ticketmaster.com (Discovery v2)
 *   EVENTBRITE_API_KEY    eventbrite.com (private token)
 *   DTCM_API_KEY          Dubai Gov / DET Dubai Calendar API
 *   NEWS_API_KEY          newsapi.org
 */

export interface SourceEvent {
    title: string;
    dateStart: string; // YYYY-MM-DD
    dateEnd: string;   // YYYY-MM-DD
    venue?: string;
    city?: string;
    url?: string;
    source: "serpapi_google_events" | "ticketmaster" | "eventbrite" | "dtcm";
    raw?: unknown;
}

export interface SourceNews {
    title: string;
    publishedAt: string; // ISO
    url?: string;
    snippet?: string;
    source: "serpapi_google_news" | "newsapi";
}

export interface SourceError {
    source: string;
    error: string;
}

function getKey(...names: string[]): string | undefined {
    for (const n of names) {
        const v = process.env[n];
        if (v && v.trim()) return v.trim();
    }
    return undefined;
}

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 15000): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...init, signal: controller.signal });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
        }
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
}

/** Parse SerpAPI google_events date blobs ("Dec 30 – Jan 2", "Sat, Mar 7, 7:00 PM") into ISO dates. */
function parseSerpEventDate(d: { start_date?: string; when?: string } | undefined, fallbackYear: number): { start: string; end: string } | null {
    if (!d) return null;
    const text = d.start_date || d.when || "";
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const matches = [...text.toLowerCase().matchAll(/([a-z]{3})[a-z]*\s+(\d{1,2})/g)];
    if (matches.length === 0) return null;
    const toIso = (m: RegExpMatchArray): string | null => {
        const mi = months.indexOf(m[1]);
        if (mi === -1) return null;
        const day = parseInt(m[2]);
        return `${fallbackYear}-${String(mi + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    };
    const start = toIso(matches[0]);
    const end = matches.length > 1 ? toIso(matches[matches.length - 1]) : start;
    if (!start) return null;
    return { start, end: end || start };
}

// ── SERP API ────────────────────────────────────────────────────────────────────

/** Google Events via SerpAPI — structured event listings for a location. */
export async function serpGoogleEvents(
    location: string,
    opts: { dateFrom?: string; dateTo?: string } = {}
): Promise<{ events: SourceEvent[]; error?: SourceError }> {
    const key = getKey("SERP_API_KEY", "SERPAPI_API_KEY");
    if (!key) return { events: [], error: { source: "serpapi_google_events", error: "SERP_API_KEY not set" } };

    try {
        const params = new URLSearchParams({
            engine: "google_events",
            q: `events in ${location}`,
            hl: "en",
            api_key: key,
        });
        const data = await fetchJson(`https://serpapi.com/search.json?${params}`);
        const year = opts.dateFrom ? parseInt(opts.dateFrom.slice(0, 4)) : new Date().getFullYear();

        const events: SourceEvent[] = (data.events_results || [])
            .map((e: any): SourceEvent | null => {
                const dates = parseSerpEventDate(e.date, year);
                if (!dates) return null;
                return {
                    title: e.title,
                    dateStart: dates.start,
                    dateEnd: dates.end,
                    venue: e.venue?.name || e.address?.[0],
                    city: location,
                    url: e.link,
                    source: "serpapi_google_events",
                };
            })
            .filter(Boolean);

        // Optional date-range filter
        const filtered = events.filter((e) => {
            if (opts.dateFrom && e.dateEnd < opts.dateFrom) return false;
            if (opts.dateTo && e.dateStart > opts.dateTo) return false;
            return true;
        });

        return { events: filtered };
    } catch (err) {
        return { events: [], error: { source: "serpapi_google_events", error: (err as Error).message } };
    }
}

/** Google News via SerpAPI — recent news affecting travel demand for a location. */
export async function serpGoogleNews(
    query: string
): Promise<{ news: SourceNews[]; error?: SourceError }> {
    const key = getKey("SERP_API_KEY", "SERPAPI_API_KEY");
    if (!key) return { news: [], error: { source: "serpapi_google_news", error: "SERP_API_KEY not set" } };

    try {
        const params = new URLSearchParams({
            engine: "google_news",
            q: query,
            hl: "en",
            api_key: key,
        });
        const data = await fetchJson(`https://serpapi.com/search.json?${params}`);
        const news: SourceNews[] = (data.news_results || []).slice(0, 20).map((n: any) => ({
            title: n.title,
            publishedAt: n.date || new Date().toISOString(),
            url: n.link,
            snippet: n.snippet,
            source: "serpapi_google_news" as const,
        }));
        return { news };
    } catch (err) {
        return { news: [], error: { source: "serpapi_google_news", error: (err as Error).message } };
    }
}

/** Plain Google search via SerpAPI — for market-rate / competitor research. */
export async function serpGoogleSearch(
    query: string
): Promise<{ results: Array<{ title: string; snippet: string; url?: string }>; error?: SourceError }> {
    const key = getKey("SERP_API_KEY", "SERPAPI_API_KEY");
    if (!key) return { results: [], error: { source: "serpapi_google", error: "SERP_API_KEY not set" } };

    try {
        const params = new URLSearchParams({ engine: "google", q: query, hl: "en", num: "10", api_key: key });
        const data = await fetchJson(`https://serpapi.com/search.json?${params}`);
        const results = (data.organic_results || []).slice(0, 10).map((r: any) => ({
            title: r.title,
            snippet: r.snippet || "",
            url: r.link,
        }));
        return { results };
    } catch (err) {
        return { results: [], error: { source: "serpapi_google", error: (err as Error).message } };
    }
}

// ── Ticketmaster Discovery v2 ───────────────────────────────────────────────────

export async function ticketmasterEvents(
    city: string,
    dateFrom: string,
    dateTo: string,
    countryCode?: string
): Promise<{ events: SourceEvent[]; error?: SourceError }> {
    const key = getKey("TICKETMASTER_API_KEY");
    if (!key) return { events: [], error: { source: "ticketmaster", error: "TICKETMASTER_API_KEY not set" } };

    try {
        const params = new URLSearchParams({
            apikey: key,
            city,
            startDateTime: `${dateFrom}T00:00:00Z`,
            endDateTime: `${dateTo}T23:59:59Z`,
            size: "50",
            sort: "date,asc",
        });
        if (countryCode) params.set("countryCode", countryCode);
        const data = await fetchJson(`https://app.ticketmaster.com/discovery/v2/events.json?${params}`);
        const events: SourceEvent[] = (data._embedded?.events || []).map((e: any) => ({
            title: e.name,
            dateStart: e.dates?.start?.localDate || dateFrom,
            dateEnd: e.dates?.end?.localDate || e.dates?.start?.localDate || dateFrom,
            venue: e._embedded?.venues?.[0]?.name,
            city,
            url: e.url,
            source: "ticketmaster" as const,
        }));
        return { events };
    } catch (err) {
        return { events: [], error: { source: "ticketmaster", error: (err as Error).message } };
    }
}

// ── Eventbrite (best-effort — public search API is deprecated) ──────────────────

export async function eventbriteEvents(
    city: string,
    dateFrom: string,
    dateTo: string
): Promise<{ events: SourceEvent[]; error?: SourceError }> {
    const key = getKey("EVENTBRITE_API_KEY", "EVENTBRITE_TOKEN");
    if (!key) return { events: [], error: { source: "eventbrite", error: "EVENTBRITE_API_KEY not set" } };

    try {
        const params = new URLSearchParams({
            "location.address": city,
            "start_date.range_start": `${dateFrom}T00:00:00`,
            "start_date.range_end": `${dateTo}T23:59:59`,
            expand: "venue",
        });
        const data = await fetchJson(
            `https://www.eventbriteapi.com/v3/events/search/?${params}`,
            { headers: { Authorization: `Bearer ${key}` } }
        );
        const events: SourceEvent[] = (data.events || []).map((e: any) => ({
            title: e.name?.text || "Untitled",
            dateStart: (e.start?.local || dateFrom).slice(0, 10),
            dateEnd: (e.end?.local || e.start?.local || dateFrom).slice(0, 10),
            venue: e.venue?.name,
            city,
            url: e.url,
            source: "eventbrite" as const,
        }));
        return { events };
    } catch (err) {
        // Eventbrite's public search endpoint was retired for new apps — tolerate 404s.
        return { events: [], error: { source: "eventbrite", error: (err as Error).message } };
    }
}

// ── NewsAPI.org ─────────────────────────────────────────────────────────────────

export async function newsApiSearch(
    query: string,
    dateFrom?: string
): Promise<{ news: SourceNews[]; error?: SourceError }> {
    const key = getKey("NEWS_API_KEY", "NEWSAPI_KEY");
    if (!key) return { news: [], error: { source: "newsapi", error: "NEWS_API_KEY not set" } };

    try {
        const params = new URLSearchParams({
            q: query,
            language: "en",
            sortBy: "relevancy",
            pageSize: "20",
            apiKey: key,
        });
        if (dateFrom) params.set("from", dateFrom);
        const data = await fetchJson(`https://newsapi.org/v2/everything?${params}`);
        const news: SourceNews[] = (data.articles || []).map((a: any) => ({
            title: a.title,
            publishedAt: a.publishedAt,
            url: a.url,
            snippet: a.description,
            source: "newsapi" as const,
        }));
        return { news };
    } catch (err) {
        return { news: [], error: { source: "newsapi", error: (err as Error).message } };
    }
}

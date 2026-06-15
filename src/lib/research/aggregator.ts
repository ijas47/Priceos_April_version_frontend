/**
 * Market Intelligence Aggregator
 *
 * Fans out to structured sources (SERP Google Events, Ticketmaster,
 * Eventbrite, SERP Google News, NewsAPI), deduplicates, and scores
 * demand impact. This is the single entry point agents should use for
 * "what is happening in <city> between <from> and <to>".
 *
 * Source trust ladder:
 *   1. Ticketmaster / Eventbrite   — confirmed ticketed events (confidence 0.9)
 *   2. SERP Google Events          — indexed listings        (confidence 0.8)
 *   3. SERP Google News / NewsAPI  — demand signals          (confidence 0.7)
 *   4. Perplexity (NOT here)       — only as a fallback in the research agent,
 *                                    capped at confidence 0.5 and labeled.
 *
 * Nothing in this module fabricates data: if no source has keys configured,
 * the result is empty with explicit per-source errors.
 */

import {
    serpGoogleEvents,
    serpGoogleNews,
    ticketmasterEvents,
    eventbriteEvents,
    newsApiSearch,
    type SourceEvent,
    type SourceNews,
    type SourceError,
} from "./sources";

export interface IntelFinding {
    title: string;
    dateStart: string;
    dateEnd: string;
    type: "event" | "news";
    impact: "high" | "medium" | "low";
    confidence: number; // 0-1
    description: string;
    source: string;
    url?: string;
    suggestedPremiumPct: number;
}

export interface SourceBreakdownEntry {
    findings: number;
    status: "ok" | "error" | "skipped";
    error?: string;
}

export interface MarketIntelligence {
    location: string;
    dateRange: { from: string; to: string };
    findings: IntelFinding[];
    sourcesUsed: string[];
    sourceErrors: SourceError[];
    /** Per-feed counts — use in setup logs / debug to verify SERP vs NewsAPI vs ticketed sources */
    sourceBreakdown: Record<string, SourceBreakdownEntry>;
    gatheredAt: string;
}

// Keyword heuristics for demand impact. Conservative: unknown → low.
const HIGH_IMPACT = /\b(f1|grand prix|world cup|expo|gitex|comic.?con|air ?show|festival|new year|nye|summit|olympics|cricket|concert tour|stadium|arena)\b/i;
const MEDIUM_IMPACT = /\b(conference|exhibition|marathon|championship|concert|fair|convention|tournament|race|carnival|parade)\b/i;
const NEWS_DEMAND_POSITIVE = /\b(record tourist|visitor surge|new route|flight capacity|new airline|direct flight|hotel occupancy|tourism record|visa waiver|visa.free)\b/i;
const NEWS_DEMAND_NEGATIVE = /\b(travel warning|flight cancell|airport clos|conflict|war|outbreak|curfew|storm|flood|earthquake)\b/i;

function scoreEvent(e: SourceEvent): { impact: IntelFinding["impact"]; premiumPct: number } {
    const text = `${e.title} ${e.venue || ""}`;
    if (HIGH_IMPACT.test(text)) return { impact: "high", premiumPct: 25 };
    if (MEDIUM_IMPACT.test(text)) return { impact: "medium", premiumPct: 12 };
    return { impact: "low", premiumPct: 5 };
}

function sourceConfidence(source: SourceEvent["source"]): number {
    switch (source) {
        case "ticketmaster": return 0.9;
        case "eventbrite": return 0.9;
        case "serpapi_google_events": return 0.8;
        default: return 0.6;
    }
}

/** Normalize title for dedupe: lowercase, strip punctuation/whitespace. */
function dedupeKey(title: string, dateStart: string): string {
    return `${title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 60)}|${dateStart}`;
}

export async function gatherMarketIntelligence(opts: {
    city: string;
    area?: string;
    countryCode?: string;
    dateFrom: string; // YYYY-MM-DD
    dateTo: string;   // YYYY-MM-DD
    includeNews?: boolean;
}): Promise<MarketIntelligence> {
    const { city, area, countryCode, dateFrom, dateTo, includeNews = true } = opts;
    const location = area ? `${area}, ${city}` : city;

    const [serpEv, tmEv, ebEv, serpNews, napiNews] = await Promise.all([
        serpGoogleEvents(city, { dateFrom, dateTo }),
        ticketmasterEvents(city, dateFrom, dateTo, countryCode),
        eventbriteEvents(city, dateFrom, dateTo),
        includeNews
            ? serpGoogleNews(`${city} tourism travel demand events`)
            : Promise.resolve({ news: [] as SourceNews[], error: undefined }),
        includeNews
            ? newsApiSearch(`${city} tourism OR travel OR flights`, dateFrom)
            : Promise.resolve({ news: [] as SourceNews[], error: undefined }),
    ]);

    const errors: SourceError[] = [serpEv.error, tmEv.error, ebEv.error, serpNews.error, napiNews.error]
        .filter((e): e is SourceError => !!e);

    const sourceBreakdown: Record<string, SourceBreakdownEntry> = {
        serpapi_google_events: serpEv.error
            ? { findings: 0, status: "error", error: serpEv.error.error }
            : { findings: serpEv.events.length, status: "ok" },
        ticketmaster: tmEv.error
            ? { findings: 0, status: "error", error: tmEv.error.error }
            : { findings: tmEv.events.length, status: "ok" },
        eventbrite: ebEv.error
            ? { findings: 0, status: "error", error: ebEv.error.error }
            : { findings: ebEv.events.length, status: "ok" },
        serpapi_google_news: !includeNews
            ? { findings: 0, status: "skipped" }
            : serpNews.error
              ? { findings: 0, status: "error", error: serpNews.error.error }
              : { findings: serpNews.news.length, status: "ok" },
        newsapi: !includeNews
            ? { findings: 0, status: "skipped" }
            : napiNews.error
              ? { findings: 0, status: "error", error: napiNews.error.error }
              : { findings: napiNews.news.length, status: "ok" },
    };

    const sourcesUsed: string[] = [];
    const findings: IntelFinding[] = [];
    const seen = new Set<string>();

    // Events — ticketed sources first so they win the dedupe.
    const allEvents: SourceEvent[] = [...tmEv.events, ...ebEv.events, ...serpEv.events];
    for (const e of allEvents) {
        const key = dedupeKey(e.title, e.dateStart);
        if (seen.has(key)) continue;
        seen.add(key);
        if (!sourcesUsed.includes(e.source)) sourcesUsed.push(e.source);
        const { impact, premiumPct } = scoreEvent(e);
        findings.push({
            title: e.title,
            dateStart: e.dateStart,
            dateEnd: e.dateEnd,
            type: "event",
            impact,
            confidence: sourceConfidence(e.source),
            description: [e.venue && `Venue: ${e.venue}`, `Source: ${e.source}`].filter(Boolean).join(". "),
            source: e.source,
            url: e.url,
            suggestedPremiumPct: premiumPct,
        });
    }

    // News — only items that clearly signal demand change.
    const allNews: SourceNews[] = [...serpNews.news, ...napiNews.news];
    for (const n of allNews) {
        const positive = NEWS_DEMAND_POSITIVE.test(n.title + " " + (n.snippet || ""));
        const negative = NEWS_DEMAND_NEGATIVE.test(n.title + " " + (n.snippet || ""));
        if (!positive && !negative) continue;
        const key = dedupeKey(n.title, dateFrom);
        if (seen.has(key)) continue;
        seen.add(key);
        if (!sourcesUsed.includes(n.source)) sourcesUsed.push(n.source);
        findings.push({
            title: n.title,
            dateStart: dateFrom,
            dateEnd: dateTo,
            type: "news",
            impact: negative ? "high" : "medium",
            confidence: 0.7,
            description: `${n.snippet || ""} (${negative ? "demand-negative" : "demand-positive"} signal)`,
            source: n.source,
            url: n.url,
            suggestedPremiumPct: negative ? -10 : 8,
        });
    }

    findings.sort((a, b) => a.dateStart.localeCompare(b.dateStart));

    return {
        location,
        dateRange: { from: dateFrom, to: dateTo },
        findings,
        sourcesUsed,
        sourceErrors: errors,
        sourceBreakdown,
        gatheredAt: new Date().toISOString(),
    };
}

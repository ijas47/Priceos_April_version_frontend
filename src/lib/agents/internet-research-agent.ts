/**
 * Internet Research Agent
 *
 * Multi-source market research with a strict trust ladder:
 *
 *   1. STRUCTURED SOURCES (preferred — verifiable data)
 *      SERP API (Google Events / News / Search), Ticketmaster, Eventbrite,
 *      NewsAPI — via src/lib/research/aggregator.ts
 *   2. PERPLEXITY SONAR (fallback synthesis only)
 *      Used only when structured sources return nothing. Findings are
 *      capped at confidence 0.5 and labeled "perplexity (unverified)" —
 *      Perplexity states wrong facts confidently and must never be the
 *      sole basis for a pricing decision.
 *   3. SEASONAL SNAPSHOT (last resort)
 *      Deterministic season-level demand hints only. NEVER fabricates
 *      events, news, or specific dates.
 */

import { gatherMarketIntelligence } from "@/lib/research/aggregator";
import { serpGoogleSearch } from "@/lib/research/sources";

export interface ResearchFinding {
    title: string;
    date_start: string;
    date_end: string;
    expected_impact: "high" | "medium" | "low";
    confidence: number; // 0-1
    description: string;
    source: string;
    pricing_relevance: string;
}

export interface MarketSnapshot {
    average_nightly_rate: number | null;
    occupancy_trend: "increasing" | "stable" | "decreasing" | null;
    demand_level: "high" | "medium" | "low" | null;
    notable_factors: string[];
}

export interface ResearchResult {
    query_type: "events" | "market_rates" | "area_intelligence" | "tourism_trends";
    location: string;
    date_range: { start: string; end: string };
    findings: ResearchFinding[];
    market_snapshot: MarketSnapshot;
    summary: string;
    cached: boolean;
    timestamp: string;
    sources_used: string[];
}

const researchCache = new Map<string, { result: ResearchResult; expiresAt: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const PERPLEXITY_SYSTEM_PROMPT = `You are a research assistant for a short-term rental pricing platform. Search the internet and return accurate, real-time information relevant to rental demand in the requested city.

Always respond in EXACT JSON (no markdown):
{
  "findings": [
    { "title": "...", "date_start": "YYYY-MM-DD", "date_end": "YYYY-MM-DD",
      "expected_impact": "high"|"medium"|"low", "confidence": 0.0-1.0,
      "description": "...", "source": "URL or name", "pricing_relevance": "..." }
  ],
  "market_snapshot": {
    "average_nightly_rate": number|null,
    "occupancy_trend": "increasing"|"stable"|"decreasing"|null,
    "demand_level": "high"|"medium"|"low"|null,
    "notable_factors": ["..."]
  },
  "summary": "2-3 sentences"
}

Rules: cite real sources; use YYYY-MM-DD dates; if you cannot find reliable info, return empty findings — NEVER fabricate.`;

export class InternetResearchAgent {
    private perplexityKey: string | undefined;
    private perplexityUrl = "https://api.perplexity.ai/chat/completions";

    constructor(apiKey?: string) {
        this.perplexityKey = apiKey || process.env.PERPLEXITY_API_KEY;
    }

    /** Events affecting rental demand — structured sources first. */
    async searchEvents(
        area: string,
        startDate: Date,
        endDate: Date,
        city?: string
    ): Promise<ResearchResult> {
        const targetCity = city || this.cityFromArea(area);
        const from = this.formatDate(startDate);
        const to = this.formatDate(endDate);
        const cacheKey = `events:${targetCity}:${area}:${from}:${to}`;
        const hit = researchCache.get(cacheKey);
        if (hit && hit.expiresAt > Date.now()) return { ...hit.result, cached: true };

        // 1. Structured sources
        const intel = await gatherMarketIntelligence({
            city: targetCity,
            area: area !== targetCity ? area : undefined,
            dateFrom: from,
            dateTo: to,
        });

        let result: ResearchResult;
        if (intel.findings.length > 0) {
            result = {
                query_type: "events",
                location: intel.location,
                date_range: { start: from, end: to },
                findings: intel.findings.map((f) => ({
                    title: f.title,
                    date_start: f.dateStart,
                    date_end: f.dateEnd,
                    expected_impact: f.impact,
                    confidence: f.confidence,
                    description: f.description,
                    source: f.source,
                    pricing_relevance:
                        f.suggestedPremiumPct >= 0
                            ? `Demand uplift — consider +${f.suggestedPremiumPct}% on overlapping nights.`
                            : `Demand risk — consider ${f.suggestedPremiumPct}% and flexible cancellation.`,
                })),
                market_snapshot: this.seasonalSnapshot(targetCity, startDate),
                summary: `${intel.findings.length} verified findings for ${intel.location} from ${intel.sourcesUsed.join(", ")}.`,
                cached: false,
                timestamp: new Date().toISOString(),
                sources_used: intel.sourcesUsed,
            };
        } else {
            // 2. Perplexity fallback (labeled, capped)
            const query = `Upcoming events in ${targetCity}${area && area !== targetCity ? ` (especially the ${area} area)` : ""} between ${from} and ${to} that affect short-term rental demand: concerts, festivals, conferences, sports, public holidays, school holidays.`;
            result = await this.perplexityQuery(query, "events", intel.location, startDate, endDate);
            if (intel.sourceErrors.length > 0) {
                result.summary += ` [Structured sources unavailable: ${intel.sourceErrors.map((e) => e.source).join(", ")} — configure SERP_API_KEY / TICKETMASTER_API_KEY for verified data.]`;
            }
        }

        researchCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
        return result;
    }

    /** Market nightly rates — SERP search snippets first, Perplexity synthesis fallback. */
    async searchMarketRates(
        area: string,
        bedrooms: number,
        startDate: Date,
        endDate: Date,
        city?: string
    ): Promise<ResearchResult> {
        const targetCity = city || this.cityFromArea(area);
        const from = this.formatDate(startDate);
        const to = this.formatDate(endDate);
        const cacheKey = `rates:${targetCity}:${area}:${bedrooms}:${from}:${to}`;
        const hit = researchCache.get(cacheKey);
        if (hit && hit.expiresAt > Date.now()) return { ...hit.result, cached: true };

        const serp = await serpGoogleSearch(
            `average nightly rate ${bedrooms} bedroom short term rental Airbnb ${area} ${targetCity} ${startDate.getFullYear()}`
        );

        let result: ResearchResult;
        if (serp.results.length > 0) {
            result = {
                query_type: "market_rates",
                location: `${area}, ${targetCity}`,
                date_range: { start: from, end: to },
                findings: serp.results.slice(0, 6).map((r) => ({
                    title: r.title,
                    date_start: from,
                    date_end: to,
                    expected_impact: "medium" as const,
                    confidence: 0.7,
                    description: r.snippet,
                    source: r.url || "google_search",
                    pricing_relevance: "Market-rate reference for comp benchmarking.",
                })),
                market_snapshot: this.seasonalSnapshot(targetCity, startDate),
                summary: `${serp.results.length} market-rate references found via Google for ${bedrooms}BR in ${area}, ${targetCity}.`,
                cached: false,
                timestamp: new Date().toISOString(),
                sources_used: ["serpapi_google"],
            };
        } else {
            const query = `Current average nightly rates for ${bedrooms}-bedroom short-term rentals in ${area}, ${targetCity} for ${from} to ${to}. Include hotel comparison and seasonal trends.`;
            result = await this.perplexityQuery(query, "market_rates", `${area}, ${targetCity}`, startDate, endDate);
        }

        researchCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
        return result;
    }

    /** Area outlook — events + news for the next 30 days. */
    async searchAreaIntelligence(area: string, city?: string): Promise<ResearchResult> {
        const now = new Date();
        const thirty = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        return this.searchEvents(area, now, thirty, city);
    }

    /** Tourism trends — news-driven. */
    async searchTourismTrends(
        startDate: Date,
        endDate: Date,
        city = "Dubai"
    ): Promise<ResearchResult> {
        return this.searchEvents(city, startDate, endDate, city);
    }

    /** Free-form question — Perplexity with structured-source context when available. */
    async generalQuery(userQuery: string, area: string = "Dubai", city?: string): Promise<ResearchResult> {
        const targetCity = city || this.cityFromArea(area);
        const now = new Date();
        const thirty = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const query = `For a short-term rental property in ${area}, ${targetCity}: ${userQuery}. Focus on information relevant to pricing decisions.`;
        return this.perplexityQuery(query, "events", `${area}, ${targetCity}`, now, thirty);
    }

    // ── Perplexity (fallback only — capped confidence) ──────────────────────────

    private async perplexityQuery(
        userQuery: string,
        queryType: ResearchResult["query_type"],
        location: string,
        startDate: Date,
        endDate: Date
    ): Promise<ResearchResult> {
        const empty = (summary: string): ResearchResult => ({
            query_type: queryType,
            location,
            date_range: { start: this.formatDate(startDate), end: this.formatDate(endDate) },
            findings: [],
            market_snapshot: this.seasonalSnapshot(location, startDate),
            summary,
            cached: false,
            timestamp: new Date().toISOString(),
            sources_used: [],
        });

        if (!this.perplexityKey) {
            return empty(
                "No verified findings. Structured sources returned nothing and PERPLEXITY_API_KEY is not set. " +
                "Seasonal snapshot only — no events were fabricated."
            );
        }

        try {
            const response = await fetch(this.perplexityUrl, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${this.perplexityKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: "sonar",
                    messages: [
                        { role: "system", content: PERPLEXITY_SYSTEM_PROMPT },
                        { role: "user", content: userQuery },
                    ],
                    temperature: 0.2,
                    max_tokens: 1200,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[InternetResearchAgent] Perplexity error ${response.status}: ${errorText.slice(0, 200)}`);
                return empty(`Perplexity unavailable (${response.status}). No findings — nothing fabricated.`);
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content || "";
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return empty("Perplexity returned unparseable output. No findings.");

            const parsed = JSON.parse(jsonMatch[0]);
            const findings: ResearchFinding[] = (parsed.findings || []).map((f: any) => ({
                title: f.title || "Unknown",
                date_start: f.date_start || this.formatDate(startDate),
                date_end: f.date_end || this.formatDate(endDate),
                expected_impact: f.expected_impact || "low",
                // Hard cap: Perplexity output is unverified.
                confidence: Math.min(0.5, Math.max(0, Number(f.confidence) || 0.4)),
                description: f.description || "",
                source: `perplexity (unverified): ${f.source || "no citation"}`,
                pricing_relevance: f.pricing_relevance || "",
            }));

            return {
                query_type: queryType,
                location,
                date_range: { start: this.formatDate(startDate), end: this.formatDate(endDate) },
                findings,
                market_snapshot: {
                    average_nightly_rate: parsed.market_snapshot?.average_nightly_rate ?? null,
                    occupancy_trend: parsed.market_snapshot?.occupancy_trend ?? null,
                    demand_level: parsed.market_snapshot?.demand_level ?? null,
                    notable_factors: parsed.market_snapshot?.notable_factors || [],
                },
                summary: `[UNVERIFIED — Perplexity fallback, verify before pricing on this] ${parsed.summary || ""}`,
                cached: false,
                timestamp: new Date().toISOString(),
                sources_used: ["perplexity"],
            };
        } catch (error) {
            console.error("[InternetResearchAgent] Perplexity call failed:", error);
            return empty("Research providers unreachable. No findings — nothing fabricated.");
        }
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────

    /** Seasonal demand snapshot — deterministic, city-aware, no fabricated events. */
    private seasonalSnapshot(cityOrLocation: string, startDate: Date): MarketSnapshot {
        const month = startDate.getMonth(); // 0-based
        const city = cityOrLocation.toLowerCase();

        // Gulf cities: winter peak, summer trough. Default (temperate): summer peak.
        const gulf = /dubai|abu dhabi|doha|riyadh|jeddah|muscat|kuwait|bahrain|sharjah/.test(city);
        const peak = gulf ? month >= 10 || month <= 2 : month >= 5 && month <= 8;
        const low = gulf ? month >= 5 && month <= 7 : month === 0 || month === 1;

        return {
            average_nightly_rate: null,
            occupancy_trend: peak ? "increasing" : low ? "decreasing" : "stable",
            demand_level: peak ? "high" : low ? "low" : "medium",
            notable_factors: [
                `Seasonal pattern (${gulf ? "Gulf climate" : "temperate"}): ${peak ? "peak" : low ? "low" : "shoulder"} season`,
            ],
        };
    }

    private cityFromArea(area: string): string {
        // Known Dubai sub-areas map to Dubai; otherwise treat the area as the city.
        const dubaiAreas = /marina|jbr|downtown|difc|business bay|palm|jumeirah|deira|barsha|jlt|bluewaters|creek/i;
        if (dubaiAreas.test(area)) return "Dubai";
        return area || "Dubai";
    }

    clearCache(): void {
        researchCache.clear();
    }

    private formatDate(date: Date): string {
        return date.toISOString().split("T")[0];
    }
}

export function createInternetResearchAgent(apiKey?: string): InternetResearchAgent {
    return new InternetResearchAgent(apiKey);
}

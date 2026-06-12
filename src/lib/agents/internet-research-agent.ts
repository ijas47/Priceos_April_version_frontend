/**
 * Internet Research Agent
 * 
 * A subordinate agent that uses Perplexity's Sonar API to search the internet
 * for real-time Dubai events, market rates, area intelligence, and tourism trends.
 * 
 * The Pricing Agent (manager) delegates research tasks to this agent 
 * and uses the structured results to inform pricing suggestions.
 */

export interface ResearchFinding {
    title: string;
    date_start: string;
    date_end: string;
    expected_impact: "high" | "medium" | "low";
    confidence: number;
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
    date_range: {
        start: string;
        end: string;
    };
    findings: ResearchFinding[];
    market_snapshot: MarketSnapshot;
    summary: string;
    cached: boolean;
    timestamp: string;
}

// Simple in-memory cache to avoid hitting Perplexity repeatedly for same queries
const researchCache = new Map<string, { result: ResearchResult; expiresAt: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const PERPLEXITY_SYSTEM_PROMPT = `You are an Internet Research Agent for PriceOS, a short-term rental pricing platform focused on Dubai properties. Your job is to search the internet and provide accurate, real-time information that helps make better pricing decisions for short-term rentals.

You are NOT making pricing decisions. You are the researcher — find the facts.

Always respond in this EXACT JSON format (no markdown, no code blocks, just raw JSON):

{
  "query_type": "events" | "market_rates" | "area_intelligence" | "tourism_trends",
  "location": "the area or city searched",
  "date_range": {
    "start": "YYYY-MM-DD",
    "end": "YYYY-MM-DD"
  },
  "findings": [
    {
      "title": "Name of event or finding",
      "date_start": "YYYY-MM-DD",
      "date_end": "YYYY-MM-DD",
      "expected_impact": "high" | "medium" | "low",
      "confidence": 0.0 to 1.0,
      "description": "Brief description with specific details",
      "source": "URL or source name",
      "pricing_relevance": "How this affects short-term rental pricing"
    }
  ],
  "market_snapshot": {
    "average_nightly_rate": number or null,
    "occupancy_trend": "increasing" | "stable" | "decreasing" | null,
    "demand_level": "high" | "medium" | "low" | null,
    "notable_factors": ["factor1", "factor2"]
  },
  "summary": "2-3 sentence summary of key findings and pricing implications"
}

Rules:
1. Always include real sources with URLs when possible
2. Be specific with dates — use YYYY-MM-DD format
3. Confidence: 0.9+ = confirmed, 0.7-0.9 = highly likely, 0.5-0.7 = probable, <0.5 = speculative
4. Focus on information that DIRECTLY affects short-term rental demand
5. Consider area-specific impact — events in Downtown may not affect JBR equally
6. Include specific numbers (attendance, visitors, price ranges) when available
7. If you cannot find reliable info, say so — don't fabricate data`;


export class InternetResearchAgent {
    private apiKey: string;
    private baseUrl: string = "https://api.perplexity.ai/chat/completions";

    constructor(apiKey?: string) {
        this.apiKey = apiKey || process.env.PERPLEXITY_API_KEY!;
    }

    /**
     * Search for upcoming events that could affect rental demand
     */
    async searchEvents(
        area: string,
        startDate: Date,
        endDate: Date
    ): Promise<ResearchResult> {
        const query = `Search for upcoming events in Dubai between ${this.formatDate(startDate)} and ${this.formatDate(endDate)} that could affect short-term rental demand, especially in the ${area} area. Include concerts, festivals, conferences, exhibitions, sports events, and any major gatherings. Also check for public holidays, school holidays, and Ramadan dates if applicable.`;

        return this.query(query, "events", area, startDate, endDate);
    }

    /**
     * Get current market rates for comparable properties
     */
    async searchMarketRates(
        area: string,
        bedrooms: number,
        startDate: Date,
        endDate: Date
    ): Promise<ResearchResult> {
        const query = `What are the current average nightly rates for ${bedrooms}-bedroom Airbnb and short-term rental properties in ${area}, Dubai for the period ${this.formatDate(startDate)} to ${this.formatDate(endDate)}? Include comparison with nearby hotel rates and mention any seasonal pricing trends.`;

        return this.query(query, "market_rates", area, startDate, endDate);
    }

    /**
     * Get area-specific intelligence
     */
    async searchAreaIntelligence(area: string): Promise<ResearchResult> {
        const now = new Date();
        const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        const query = `What is the current rental demand outlook for ${area}, Dubai? Consider upcoming developments, transport changes, tourist attractions, new restaurants or attractions, and any local factors that could affect short-term rental demand in the next 30 days.`;

        return this.query(query, "area_intelligence", area, now, thirtyDaysLater);
    }

    /**
     * Get tourism trends for a specific period  
     */
    async searchTourismTrends(
        startDate: Date,
        endDate: Date
    ): Promise<ResearchResult> {
        const query = `What are the current tourism trends in Dubai for the period ${this.formatDate(startDate)} to ${this.formatDate(endDate)}? Include visitor numbers, popular source markets, airline capacity changes, new hotel openings, and any factors that could affect short-term rental occupancy.`;

        return this.query(query, "tourism_trends", "Dubai", startDate, endDate);
    }

    /**
     * General-purpose research query — the Pricing Agent can ask anything
     */
    async generalQuery(
        userQuery: string,
        area: string = "Dubai"
    ): Promise<ResearchResult> {
        const now = new Date();
        const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        // Wrap the user's query with context
        const query = `For a short-term rental property in ${area}, Dubai: ${userQuery}. Please focus on information relevant to pricing decisions.`;

        return this.query(query, "events", area, now, thirtyDaysLater);
    }

    /**
     * Core query method — calls Perplexity Sonar API
     */
    private async query(
        userQuery: string,
        queryType: ResearchResult["query_type"],
        location: string,
        startDate: Date,
        endDate: Date
    ): Promise<ResearchResult> {
        // Check cache first
        const cacheKey = `${queryType}:${location}:${this.formatDate(startDate)}:${this.formatDate(endDate)}`;
        const cached = researchCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            return { ...cached.result, cached: true };
        }

        // If no API key, return a structured fallback
        if (!this.apiKey) {
            console.warn("[InternetResearchAgent] No PERPLEXITY_API_KEY set. Returning fallback data.");
            return this.getFallbackResult(queryType, location, startDate, endDate);
        }

        try {
            console.log(`[InternetResearchAgent] Querying: "${userQuery.substring(0, 50)}..."`);
            const response = await fetch(this.baseUrl, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${this.apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: "sonar",
                    messages: [
                        { role: "system", content: PERPLEXITY_SYSTEM_PROMPT },
                        { role: "user", content: userQuery },
                    ],
                    temperature: 0.3,
                    top_p: 0.9,
                    max_tokens: 1000,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[InternetResearchAgent] Perplexity API error: ${response.status} — ${errorText}`);
                return this.getFallbackResult(queryType, location, startDate, endDate);
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content || "";

            // Parse the JSON response from Perplexity
            const result = this.parseResponse(content, queryType, location, startDate, endDate);

            console.log(`[InternetResearchAgent] Success: Received ${result.findings.length} findings.`);

            // Cache the result
            researchCache.set(cacheKey, {
                result,
                expiresAt: Date.now() + CACHE_TTL_MS,
            });

            return result;
        } catch (error) {
            console.error("[InternetResearchAgent] Error calling Perplexity:", error);
            return this.getFallbackResult(queryType, location, startDate, endDate);
        }
    }

    /**
     * Parse and validate the response from Perplexity
     */
    private parseResponse(
        content: string,
        queryType: ResearchResult["query_type"],
        location: string,
        startDate: Date,
        endDate: Date
    ): ResearchResult {
        try {
            // Try to extract JSON from the response (Perplexity sometimes wraps in markdown)
            let jsonStr = content;
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                jsonStr = jsonMatch[0];
            }

            const parsed = JSON.parse(jsonStr);

            // Validate and normalize the response
            return {
                query_type: parsed.query_type || queryType,
                location: parsed.location || location,
                date_range: parsed.date_range || {
                    start: this.formatDate(startDate),
                    end: this.formatDate(endDate),
                },
                findings: (parsed.findings || []).map((f: any) => ({
                    title: f.title || "Unknown",
                    date_start: f.date_start || this.formatDate(startDate),
                    date_end: f.date_end || this.formatDate(endDate),
                    expected_impact: f.expected_impact || "medium",
                    confidence: Math.min(1.0, Math.max(0, f.confidence || 0.5)),
                    description: f.description || "",
                    source: f.source || "Internet search",
                    pricing_relevance: f.pricing_relevance || "",
                })),
                market_snapshot: {
                    average_nightly_rate: parsed.market_snapshot?.average_nightly_rate ?? null,
                    occupancy_trend: parsed.market_snapshot?.occupancy_trend ?? null,
                    demand_level: parsed.market_snapshot?.demand_level ?? null,
                    notable_factors: parsed.market_snapshot?.notable_factors || [],
                },
                summary: parsed.summary || "No summary available",
                cached: false,
                timestamp: new Date().toISOString(),
            };
        } catch (parseError) {
            // If JSON parsing fails, extract what we can from the text
            console.warn("[InternetResearchAgent] Could not parse JSON response, extracting text summary");
            return {
                query_type: queryType,
                location,
                date_range: {
                    start: this.formatDate(startDate),
                    end: this.formatDate(endDate),
                },
                findings: [],
                market_snapshot: {
                    average_nightly_rate: null,
                    occupancy_trend: null,
                    demand_level: null,
                    notable_factors: [],
                },
                summary: content.substring(0, 500),
                cached: false,
                timestamp: new Date().toISOString(),
            };
        }
    }

    /**
     * Fallback data when Perplexity is not available
     * Uses known Dubai event calendar and seasonal patterns
     */
    private getFallbackResult(
        queryType: ResearchResult["query_type"],
        location: string,
        startDate: Date,
        endDate: Date
    ): ResearchResult {
        const month = startDate.getMonth(); // 0-based
        const now = new Date();

        // Known Dubai events (approximate annual schedule)
        const knownEvents: ResearchFinding[] = [];

        // Dubai Shopping Festival (late Dec - late Jan)
        if (month === 11 || month === 0) {
            knownEvents.push({
                title: "Dubai Shopping Festival",
                date_start: `${startDate.getFullYear()}-12-15`,
                date_end: `${startDate.getFullYear() + 1}-01-31`,
                expected_impact: "high",
                confidence: 0.9,
                description: "Annual retail festival attracting millions of visitors with deals, entertainment, and fireworks.",
                source: "Known annual event",
                pricing_relevance: "Drives 20-30% increase in short-term rental bookings city-wide.",
            });
        }

        // New Year's Eve
        if (month === 11) {
            knownEvents.push({
                title: "New Year's Eve Celebrations",
                date_start: `${startDate.getFullYear()}-12-30`,
                date_end: `${startDate.getFullYear() + 1}-01-02`,
                expected_impact: "high",
                confidence: 0.95,
                description: "Iconic Burj Khalifa fireworks and citywide celebrations. Peak tourism period.",
                source: "Known annual event",
                pricing_relevance: "Premium pricing opportunity. Rates can be 50-100% above normal for Dec 30 - Jan 2.",
            });
        }

        // Art Dubai (usually March)
        if (month === 2) {
            knownEvents.push({
                title: "Art Dubai",
                date_start: `${startDate.getFullYear()}-03-06`,
                date_end: `${startDate.getFullYear()}-03-09`,
                expected_impact: "medium",
                confidence: 0.8,
                description: "International art fair at Madinat Jumeirah. Attracts 30,000+ visitors, primarily high-net-worth.",
                source: "Known annual event",
                pricing_relevance: "Premium properties in Jumeirah and Marina can command 10-15% higher rates.",
            });
        }

        // F1 Abu Dhabi (usually late November)
        if (month === 10) {
            knownEvents.push({
                title: "F1 Abu Dhabi Grand Prix",
                date_start: `${startDate.getFullYear()}-11-20`,
                date_end: `${startDate.getFullYear()}-11-23`,
                expected_impact: "high",
                confidence: 0.85,
                description: "F1 race weekend at Yas Marina Circuit. Spillover demand into Dubai from visitors.",
                source: "Known annual event",
                pricing_relevance: "15-25% rate increase opportunity, especially for properties near highways to Abu Dhabi.",
            });
        }

        // Ramadan (approximate — shifts each year)
        if (month === 2 || month === 3) {
            knownEvents.push({
                title: "Ramadan (approximate dates)",
                date_start: `${startDate.getFullYear()}-03-01`,
                date_end: `${startDate.getFullYear()}-03-30`,
                expected_impact: "medium",
                confidence: 0.6,
                description: "Islamic holy month. Tourist patterns shift — some decrease in party tourism, increase in family visitors.",
                source: "Islamic calendar (approximate)",
                pricing_relevance: "Weekday rates may dip 10-15%, but Iftar/Suhoor tourism creates unique demand.",
            });
        }

        // Eid al-Fitr (approximate)
        if (month === 3 || month === 4) {
            knownEvents.push({
                title: "Eid al-Fitr Holiday",
                date_start: `${startDate.getFullYear()}-04-01`,
                date_end: `${startDate.getFullYear()}-04-05`,
                expected_impact: "high",
                confidence: 0.6,
                description: "Major holiday marking end of Ramadan. Strong domestic and regional travel demand.",
                source: "Islamic calendar (approximate)",
                pricing_relevance: "Rates can increase 20-30% during Eid. High demand from GCC travelers.",
            });
        }

        // National Day (Dec 2-3)
        if (month === 11) {
            knownEvents.push({
                title: "UAE National Day",
                date_start: `${startDate.getFullYear()}-12-02`,
                date_end: `${startDate.getFullYear()}-12-03`,
                expected_impact: "medium",
                confidence: 0.95,
                description: "UAE National Day celebrations with fireworks, parades, and public events.",
                source: "Known national holiday",
                pricing_relevance: "Strong domestic and regional demand. 10-20% rate increase feasible.",
            });
        }

        // Determine season
        const isPeak = month >= 10 || month <= 2; // Nov-Mar
        const isShoulder = month >= 3 && month <= 4 || month >= 8 && month <= 9; // Apr-May, Sep-Oct
        const isLow = month >= 5 && month <= 7; // Jun-Aug

        const demandLevel = isPeak ? "high" : isShoulder ? "medium" : "low";
        const occupancyTrend = isPeak ? "increasing" : isShoulder ? "stable" : "decreasing";

        const seasonNote = isPeak
            ? "Peak tourist season — pleasant weather, major events, highest demand"
            : isShoulder
                ? "Shoulder season — moderate demand, good value period"
                : "Low season — summer heat reduces tourist footfall significantly";

        return {
            query_type: queryType,
            location,
            date_range: {
                start: this.formatDate(startDate),
                end: this.formatDate(endDate),
            },
            findings: knownEvents,
            market_snapshot: {
                average_nightly_rate: null, // Can't determine without API
                occupancy_trend: occupancyTrend,
                demand_level: demandLevel,
                notable_factors: [seasonNote, `${knownEvents.length} events in range`],
            },
            summary: `Fallback data: ${knownEvents.length} known events found for ${location}. ${seasonNote}. For real-time accuracy, configure the PERPLEXITY_API_KEY.`,
            cached: false,
            timestamp: now.toISOString(),
        };
    }

    /**
     * Clear the research cache
     */
    clearCache(): void {
        researchCache.clear();
    }

    private formatDate(date: Date): string {
        return date.toISOString().split("T")[0];
    }
}

/**
 * Create an Internet Research Agent instance
 */
export function createInternetResearchAgent(apiKey?: string): InternetResearchAgent {
    return new InternetResearchAgent(apiKey);
}

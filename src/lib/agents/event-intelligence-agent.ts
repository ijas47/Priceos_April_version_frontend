import { connectDB, MarketEvent, Listing } from "@/lib/db";
import { format } from "date-fns";
import mongoose from "mongoose";
import { gatherMarketIntelligence, type SourceBreakdownEntry } from "@/lib/research/aggregator";

export interface EventSignal {
  name: string;
  startDate: string;
  endDate: string;
  location: string;
  expectedImpact: "high" | "medium" | "low";
  confidence: number; // 0-100
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface EventAnalysisResult {
  events: EventSignal[];
  dateRange: {
    start: string;
    end: string;
  };
  summary: string;
  totalEvents: number;
  highImpactEvents: number;
}

export interface EventQueryScope {
  orgId?: mongoose.Types.ObjectId | string;
  city?: string;
}

/**
 * Event Intelligence Agent
 * Reads from the `MarketEvent` collection. Events are populated by
 * fetchAndCacheEvents() from verified feeds (SERP Google Events,
 * Ticketmaster, Eventbrite) - never fabricated.
 */
export class EventIntelligenceAgent {
  async getEvents(startDate: Date, endDate: Date, scope?: EventQueryScope): Promise<EventSignal[]> {
    await connectDB();
    const startDateStr = format(startDate, "yyyy-MM-dd");
    const endDateStr = format(endDate, "yyyy-MM-dd");

    const filter: Record<string, unknown> = {
      endDate: { $gte: startDateStr },
      startDate: { $lte: endDateStr },
      isActive: true,
    };
    // Scope to the org so one tenant's events never leak into another's pricing.
    if (scope?.orgId) {
      filter.orgId = typeof scope.orgId === "string"
        ? new mongoose.Types.ObjectId(scope.orgId)
        : scope.orgId;
    }

    const cachedEvents = await MarketEvent.find(filter).lean();
    const fallbackCity = scope?.city || "";

    return cachedEvents.map((event) => ({
      name: event.name,
      startDate: event.startDate,
      endDate: event.endDate,
      location: event.area || fallbackCity || "Unknown",
      expectedImpact: event.impactLevel,
      confidence: event.source === "ai_detected" ? 50 : 85,
      description: event.description,
      metadata: { source: event.source },
    }));
  }

  async analyzeEvents(startDate: Date, endDate: Date, scope?: EventQueryScope): Promise<EventAnalysisResult> {
    const events = await this.getEvents(startDate, endDate, scope);
    const highImpactEvents = events.filter((e) => e.expectedImpact === "high").length;

    let summary = "";
    if (events.length === 0) {
      summary = "No major events detected for this period.";
    } else if (highImpactEvents > 0) {
      summary = `${highImpactEvents} high-impact event(s) detected. Significant demand increase expected.`;
    } else {
      summary = `${events.length} event(s) detected with moderate impact.`;
    }

    return {
      events,
      dateRange: {
        start: format(startDate, "yyyy-MM-dd"),
        end: format(endDate, "yyyy-MM-dd"),
      },
      summary,
      totalEvents: events.length,
      highImpactEvents,
    };
  }

  async hasEventImpact(date: Date, scope?: EventQueryScope): Promise<boolean> {
    await connectDB();
    const dateStr = format(date, "yyyy-MM-dd");

    const filter: Record<string, unknown> = {
      startDate: { $lte: dateStr },
      endDate: { $gte: dateStr },
      isActive: true,
    };
    if (scope?.orgId) {
      filter.orgId = typeof scope.orgId === "string"
        ? new mongoose.Types.ObjectId(scope.orgId)
        : scope.orgId;
    }

    const count = await MarketEvent.countDocuments(filter);
    return count > 0;
  }

  /**
   * Fetch real events from verified feeds (SERP / Ticketmaster / Eventbrite)
   * for the org's market city and cache them in MarketEvent.
   *
   * City resolution: explicit param → most common city across the org's
   * listings → error (no silent Dubai default).
   */
  async fetchAndCacheEvents(
    orgId: mongoose.Types.ObjectId,
    opts: { city?: string; daysAhead?: number } = {}
  ): Promise<{
    cached: number;
    sourcesUsed: string[];
    sourceBreakdown?: Record<string, SourceBreakdownEntry>;
    error?: string;
  }> {
    try {
      await connectDB();

      let city = opts.city;
      if (!city) {
        const listings = await Listing.find({ orgId }).select("city").lean();
        const counts = new Map<string, number>();
        for (const l of listings) {
          const c = (l.city || "").trim();
          if (c) counts.set(c, (counts.get(c) || 0) + 1);
        }
        city = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      }
      if (!city) {
        return {
          cached: 0,
          sourcesUsed: [],
          error: "Cannot determine market city - org has no listings with a city set. Pass city explicitly.",
        };
      }

      const daysAhead = opts.daysAhead ?? 180;
      const from = format(new Date(), "yyyy-MM-dd");
      const to = format(new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000), "yyyy-MM-dd");

      const intel = await gatherMarketIntelligence({ city, dateFrom: from, dateTo: to });

      if (intel.findings.length === 0) {
        console.warn(`[events] No verified findings for ${city}. Breakdown:`, intel.sourceBreakdown);
        return {
          cached: 0,
          sourcesUsed: intel.sourcesUsed,
          sourceBreakdown: intel.sourceBreakdown,
          error: intel.sourceErrors.length > 0
            ? `No events found. Source errors: ${intel.sourceErrors.map((e) => `${e.source}: ${e.error}`).join("; ")}`
            : "No events found in range.",
        };
      }

      const sourceTag = (s: string): "ticketmaster" | "eventbrite" | "serpapi" | "newsapi" | "manual" => {
        if (s === "ticketmaster") return "ticketmaster";
        if (s === "eventbrite") return "eventbrite";
        if (s.startsWith("serpapi")) return "serpapi";
        if (s === "newsapi") return "newsapi";
        return "manual";
      };

      let cachedCount = 0;
      for (const f of intel.findings.filter((x) => x.type === "event")) {
        const existing = await MarketEvent.findOne({ orgId, name: f.title, startDate: f.dateStart });
        if (!existing) {
          await MarketEvent.create({
            orgId,
            name: f.title,
            startDate: f.dateStart,
            endDate: f.dateEnd,
            area: city,
            impactLevel: f.impact,
            upliftPct: f.suggestedPremiumPct,
            description: `${f.description}${f.url ? ` (${f.url})` : ""}`,
            source: sourceTag(f.source),
            isActive: true,
          });
          cachedCount++;
        }
      }

      console.log(`[events] Cached ${cachedCount} events for ${city}. Breakdown:`, intel.sourceBreakdown);
      return { cached: cachedCount, sourcesUsed: intel.sourcesUsed, sourceBreakdown: intel.sourceBreakdown };
    } catch (error) {
      return { cached: 0, sourcesUsed: [], error: (error as Error).message };
    }
  }

  getPricingRecommendation(
    events: EventSignal[],
    weight: "low" | "medium" | "high" = "low"
  ): {
    suggestedIncrease: number;
    reasoning: string;
  } {
    if (events.length === 0) {
      return { suggestedIncrease: 0, reasoning: "No events detected, maintain current pricing" };
    }

    const caps = {
      low: { high: 8, medium: 4, low: 2 },
      medium: { high: 15, medium: 8, low: 4 },
      high: { high: 30, medium: 15, low: 5 },
    }[weight];

    const highImpactEvents = events.filter((e) => e.expectedImpact === "high");
    const mediumImpactEvents = events.filter((e) => e.expectedImpact === "medium");

    if (highImpactEvents.length > 0) {
      const eventNames = highImpactEvents.map((e) => e.name).join(", ");
      return {
        suggestedIncrease: caps.high,
        reasoning: `High-impact events detected: ${eventNames}. Capped uplift (${weight} weight).`,
      };
    }

    if (mediumImpactEvents.length > 0) {
      const eventNames = mediumImpactEvents.map((e) => e.name).join(", ");
      return {
        suggestedIncrease: caps.medium,
        reasoning: `Medium-impact events detected: ${eventNames}. Capped uplift (${weight} weight).`,
      };
    }

    return {
      suggestedIncrease: caps.low,
      reasoning: `Low-impact events detected. Minor capped uplift (${weight} weight).`,
    };
  }
}

export function createEventIntelligenceAgent(): EventIntelligenceAgent {
  return new EventIntelligenceAgent();
}

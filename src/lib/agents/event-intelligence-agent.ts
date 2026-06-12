import { connectDB, MarketEvent } from "@/lib/db";
import { format } from "date-fns";
import mongoose from "mongoose";

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

/**
 * Event Intelligence Agent
 * Reads from the `MarketEvent` collection (populated during Setup)
 */
export class EventIntelligenceAgent {
  async getEvents(startDate: Date, endDate: Date): Promise<EventSignal[]> {
    await connectDB();
    const startDateStr = format(startDate, "yyyy-MM-dd");
    const endDateStr = format(endDate, "yyyy-MM-dd");

    const cachedEvents = await MarketEvent.find({
      endDate: { $gte: startDateStr },
      startDate: { $lte: endDateStr },
      isActive: true,
    }).lean();

    return cachedEvents.map((event) => ({
      name: event.name,
      startDate: event.startDate,
      endDate: event.endDate,
      location: event.area || "Dubai",
      expectedImpact: event.impactLevel,
      confidence: 75,
      description: event.description,
      metadata: {},
    }));
  }

  async analyzeEvents(startDate: Date, endDate: Date): Promise<EventAnalysisResult> {
    const events = await this.getEvents(startDate, endDate);
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

  async hasEventImpact(date: Date): Promise<boolean> {
    await connectDB();
    const dateStr = format(date, "yyyy-MM-dd");

    const count = await MarketEvent.countDocuments({
      startDate: { $lte: dateStr },
      endDate: { $gte: dateStr },
      isActive: true,
    });

    return count > 0;
  }

  async fetchAndCacheEvents(orgId: mongoose.Types.ObjectId): Promise<{ cached: number; error?: string }> {
    try {
      await connectDB();

      const mockEvents: EventSignal[] = [
        {
          name: "Dubai Shopping Festival",
          startDate: "2026-01-01",
          endDate: "2026-02-01",
          location: "Dubai",
          expectedImpact: "high",
          confidence: 95,
          description: "Annual shopping festival attracting millions of visitors",
        },
        {
          name: "Dubai World Cup",
          startDate: "2026-03-28",
          endDate: "2026-03-28",
          location: "Dubai",
          expectedImpact: "high",
          confidence: 85,
          description: "World's richest horse race",
        },
        {
          name: "Ramadan",
          startDate: "2026-02-17",
          endDate: "2026-03-18",
          location: "Dubai",
          expectedImpact: "medium",
          confidence: 70,
          description: "Lower tourist demand during Ramadan",
        },
        {
          name: "GITEX Global",
          startDate: "2026-10-12",
          endDate: "2026-10-16",
          location: "Dubai",
          expectedImpact: "high",
          confidence: 90,
          description: "Global tech event, massive demand spike",
        },
      ];

      let cachedCount = 0;

      for (const event of mockEvents) {
        const existing = await MarketEvent.findOne({ orgId, name: event.name, startDate: event.startDate });
        if (!existing) {
          await MarketEvent.create({
            orgId,
            name: event.name,
            startDate: event.startDate,
            endDate: event.endDate,
            area: event.location,
            impactLevel: event.expectedImpact,
            upliftPct: event.expectedImpact === "high" ? 30 : event.expectedImpact === "medium" ? 15 : 5,
            description: event.description,
            source: "manual",
            isActive: true,
          });
          cachedCount++;
        }
      }

      return { cached: cachedCount };
    } catch (error) {
      return { cached: 0, error: (error as Error).message };
    }
  }

  getPricingRecommendation(events: EventSignal[]): {
    suggestedIncrease: number;
    reasoning: string;
  } {
    if (events.length === 0) {
      return { suggestedIncrease: 0, reasoning: "No events detected, maintain current pricing" };
    }

    const highImpactEvents = events.filter((e) => e.expectedImpact === "high");
    const mediumImpactEvents = events.filter((e) => e.expectedImpact === "medium");

    if (highImpactEvents.length > 0) {
      const eventNames = highImpactEvents.map((e) => e.name).join(", ");
      return {
        suggestedIncrease: 30,
        reasoning: `High-impact events detected: ${eventNames}. Significant demand increase expected.`,
      };
    }

    if (mediumImpactEvents.length > 0) {
      const eventNames = mediumImpactEvents.map((e) => e.name).join(", ");
      return {
        suggestedIncrease: 15,
        reasoning: `Medium-impact events detected: ${eventNames}. Moderate demand increase expected.`,
      };
    }

    return { suggestedIncrease: 5, reasoning: "Low-impact events detected. Minor demand increase expected." };
  }
}

export function createEventIntelligenceAgent(): EventIntelligenceAgent {
  return new EventIntelligenceAgent();
}

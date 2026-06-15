/**
 * Composite signal score for market events — drives UI sort order.
 * Verified ticketed/API feeds rank above news signals; AI-detected sinks to bottom.
 */

import { getEventTrust, normalizeEventSource } from "./source-trust";

export type EventImpact = "high" | "medium" | "low";

const IMPACT_WEIGHT: Record<EventImpact, number> = {
  high: 40,
  medium: 24,
  low: 10,
};

/** Default confidence (0–100) when not stored on the document. */
export function confidenceFromSource(source?: string | null): number {
  const tier = getEventTrust(source).tier;
  if (tier >= 3) return 90;
  if (tier === 2) {
    const key = normalizeEventSource(source);
    if (key === "newsapi") return 72;
    if (key === "serpapi") return 78;
    return 75;
  }
  if (tier === 1) return 45;
  return 28;
}

export interface ScorableEvent {
  source?: string | null;
  impactLevel?: EventImpact | string | null;
  impact?: EventImpact | string | null;
  upliftPct?: number | null;
  suggestedPremiumPct?: number | null;
  confidence?: number | null;
  startDate?: string;
  type?: "event" | "news";
}

export interface EventSignalScore {
  confidence: number;
  impact: EventImpact;
  signalScore: number;
  tier: number;
  verified: boolean;
  category: "ticketed" | "indexed" | "news" | "holiday" | "unverified";
}

function impactOf(e: ScorableEvent): EventImpact {
  const raw = (e.impactLevel || e.impact || "medium").toString().toLowerCase();
  if (raw.includes("high")) return "high";
  if (raw.includes("low")) return "low";
  return "medium";
}

function categoryFromSource(source?: string | null): EventSignalScore["category"] {
  const key = normalizeEventSource(source);
  if (key === "ticketmaster" || key === "eventbrite") return "ticketed";
  if (key === "serpapi") return "indexed";
  if (key === "newsapi") return "news";
  if (key === "market_template") return "ticketed";
  if (key === "manual") return "holiday";
  return "unverified";
}

export function scoreMarketEvent(e: ScorableEvent): EventSignalScore {
  const meta = getEventTrust(e.source);
  const impact = impactOf(e);
  const confidence = e.confidence != null ? Number(e.confidence) : confidenceFromSource(e.source);
  const uplift = Math.abs(Number(e.upliftPct ?? e.suggestedPremiumPct ?? 0));
  const upliftBonus = Math.min(12, uplift * 0.4);
  const verifiedBonus = meta.verified ? 15 : 0;
  const category = categoryFromSource(e.source);

  const signalScore = Math.round(
    IMPACT_WEIGHT[impact] + confidence * 0.35 + upliftBonus + verifiedBonus + meta.tier * 5
  );

  return {
    confidence,
    impact,
    signalScore: Math.min(100, signalScore),
    tier: meta.tier,
    verified: meta.verified,
    category,
  };
}

export function compareEventSignals(a: ScorableEvent, b: ScorableEvent): number {
  const sa = scoreMarketEvent(a);
  const sb = scoreMarketEvent(b);
  if (sb.signalScore !== sa.signalScore) return sb.signalScore - sa.signalScore;
  const startA = a.startDate || "";
  const startB = b.startDate || "";
  return startA.localeCompare(startB);
}

export function isNewsSignal(e: ScorableEvent): boolean {
  const key = normalizeEventSource(e.source);
  return key === "newsapi" || (e.type === "news") || /\bdemand-(positive|negative)\b/i.test(String((e as { description?: string }).description || ""));
}
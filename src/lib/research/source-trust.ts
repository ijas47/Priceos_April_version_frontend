/**
 * Event source trust tiers for proposal guardrails and UI provenance.
 * Verified feeds (SERP, ticketed) rank above AI-synthesized signals.
 */

export type MarketEventSource =
  | "ticketmaster"
  | "eventbrite"
  | "serpapi"
  | "newsapi"
  | "manual"
  | "market_template"
  | "ai_detected"
  | "perplexity"
  | string;

/** 0 = unverified, 1 = weak, 2 = verified, 3 = ticketed/primary */
export const SOURCE_TRUST_TIER: Record<string, number> = {
  ticketmaster: 3,
  eventbrite: 3,
  serpapi: 2,
  newsapi: 2,
  manual: 2,
  market_template: 3,
  public_holiday_calendar: 2,
  ai_detected: 0,
  perplexity: 0,
};

export interface EventTrustMeta {
  tier: number;
  label: string;
  verified: boolean;
}

const SOURCE_LABELS: Record<string, string> = {
  ticketmaster: "Ticketmaster",
  eventbrite: "Eventbrite",
  serpapi: "Google Events",
  newsapi: "NewsAPI",
  manual: "Public Holiday",
  market_template: "Annual Calendar",
  public_holiday_calendar: "Holiday Calendar",
  ai_detected: "AI Detected",
  perplexity: "Perplexity (unverified)",
};

export function normalizeEventSource(source?: string | null): string {
  if (!source) return "ai_detected";
  if (source.startsWith("http")) return "serpapi";
  if (source === "public_holiday_calendar") return "manual";
  return source;
}

export function getEventTrust(source?: string | null): EventTrustMeta {
  const key = normalizeEventSource(source);
  const tier = SOURCE_TRUST_TIER[key] ?? 0;
  return {
    tier,
    label: SOURCE_LABELS[key] ?? key,
    verified: tier >= 2,
  };
}

export function getLowestTrustTier(sources: (string | undefined | null)[]): number {
  if (sources.length === 0) return 2;
  return Math.min(...sources.map((s) => getEventTrust(s).tier));
}

export interface MarketEventWindow {
  title?: string;
  start_date: string;
  end_date: string;
  source?: string;
  suggested_premium_pct?: number;
}

export function eventsOverlappingDate(
  date: string,
  events: MarketEventWindow[]
): MarketEventWindow[] {
  return events.filter((e) => e.start_date <= date && e.end_date >= date);
}

/** Max allowed positive change % when event trust is at or below this tier. */
export const UNVERIFIED_PREMIUM_CAP_PCT = 5;
export const UNVERIFIED_PREMIUM_REJECT_PCT = 15;
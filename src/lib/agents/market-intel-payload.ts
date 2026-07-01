/**
 * Splits cached MarketEvent rows into Market Research agent shapes:
 * news, daily_events, holidays, and major multi-day events.
 */

export interface MarketEventInput {
  name: string;
  startDate: string;
  endDate: string;
  impactLevel?: string | null;
  upliftPct?: number | null;
  confidence?: number | null;
  description?: string | null;
  source?: string | null;
}

export interface MarketNewsItem {
  headline: string;
  date: string;
  category: string;
  sentiment: "positive" | "negative" | "neutral";
  demand_impact: string;
  suggested_premium_pct: number;
  description: string;
  source: string;
  confidence: number;
}

export interface MarketDailyEvent {
  title: string;
  date: string;
  expected_attendees: number | null;
  impact: string;
  suggested_premium_pct: number;
  source: string;
  description: string;
}

export interface MarketHolidayItem {
  title: string;
  start_date: string;
  end_date: string;
  impact: string;
  suggested_premium_pct: number;
  description: string;
}

export interface MarketMajorEvent {
  title: string;
  start_date: string;
  end_date: string;
  impact: string;
  description: string;
  suggested_premium_pct: number;
  source: string;
  confidence: number;
}

export interface DemandOutlook {
  trend: "strong" | "moderate" | "weak";
  reason: string;
  negative_factors: string[];
  positive_factors: string[];
  net_news_factor_pct: number;
}

export interface MarketIntelPayload {
  market_events: MarketMajorEvent[];
  news: MarketNewsItem[];
  daily_events: MarketDailyEvent[];
  holidays: MarketHolidayItem[];
  demand_outlook: DemandOutlook;
}

const NEWS_SOURCES = new Set(["newsapi", "serpapi"]);
const TICKETED_SOURCES = new Set([
  "ticketmaster",
  "eventbrite",
  "dtcm",
  "dcul",
  "manual",
]);

const HOLIDAY_RE =
  /eid|ramadan|national day|christmas|new year|diwali|holiday|f1|formula 1/i;

function isNewsRow(e: MarketEventInput): boolean {
  const desc = String(e.description ?? "");
  return (
    NEWS_SOURCES.has(String(e.source ?? "")) ||
    desc.includes("[news]") ||
    /\bdemand-(positive|negative)\b/i.test(desc)
  );
}

function isHolidayRow(e: MarketEventInput): boolean {
  if (e.source === "market_template") return true;
  return HOLIDAY_RE.test(e.name);
}

function newsSentiment(
  uplift: number,
  description: string
): "positive" | "negative" | "neutral" {
  if (uplift < 0 || /demand-negative/i.test(description)) return "negative";
  if (uplift > 0 || /demand-positive/i.test(description)) return "positive";
  return "neutral";
}

function newsCategory(description: string, headline: string): string {
  const text = `${headline} ${description}`.toLowerCase();
  if (/flight|airport|transport|infrastructure/.test(text)) return "infrastructure";
  if (/tourism|arrival|visitor|travel/.test(text)) return "tourism";
  if (/econom|gdp|market/.test(text)) return "economic";
  if (/politic|regulation|visa/.test(text)) return "policy";
  return "general";
}

function parseAttendees(description: string): number | null {
  const m = description.match(/(\d[\d,]*)\s*(attendees|visitors|guests)/i);
  if (!m) return null;
  return Number(m[1].replace(/,/g, ""));
}

export function buildMarketIntelPayload(events: MarketEventInput[]): MarketIntelPayload {
  const news: MarketNewsItem[] = [];
  const daily_events: MarketDailyEvent[] = [];
  const holidays: MarketHolidayItem[] = [];
  const market_events: MarketMajorEvent[] = [];

  for (const e of events.slice(0, 50)) {
    const uplift = Number(e.upliftPct ?? 0);
    const impact = e.impactLevel || "medium";
    const confidence = Number(e.confidence ?? 0.75);
    const desc = String(e.description ?? "");
    const source = String(e.source ?? "ai_detected");

    if (isNewsRow(e)) {
      const sentiment = newsSentiment(uplift, desc);
      news.push({
        headline: e.name,
        date: e.startDate,
        category: newsCategory(desc, e.name),
        sentiment,
        demand_impact:
          sentiment === "negative"
            ? "May reduce short-term booking demand"
            : sentiment === "positive"
              ? "Supports booking demand in the window"
              : "Neutral demand signal",
        suggested_premium_pct: uplift,
        description: desc,
        source,
        confidence,
      });
      continue;
    }

    if (isHolidayRow(e)) {
      holidays.push({
        title: e.name,
        start_date: e.startDate,
        end_date: e.endDate,
        impact,
        suggested_premium_pct: uplift,
        description: desc,
      });
      continue;
    }

    const isSingleDay = e.startDate === e.endDate;
    if (isSingleDay && (TICKETED_SOURCES.has(source) || impact !== "low")) {
      daily_events.push({
        title: e.name,
        date: e.startDate,
        expected_attendees: parseAttendees(desc),
        impact,
        suggested_premium_pct: uplift,
        source,
        description: desc,
      });
      continue;
    }

    market_events.push({
      title: e.name,
      start_date: e.startDate,
      end_date: e.endDate,
      impact,
      description: desc,
      suggested_premium_pct: uplift,
      source,
      confidence,
    });
  }

  const netNewsPct = news.reduce((s, n) => s + n.suggested_premium_pct, 0);
  const negative = news.filter((n) => n.sentiment === "negative");
  const positive = news.filter((n) => n.sentiment === "positive");

  let trend: DemandOutlook["trend"] = "moderate";
  if (netNewsPct <= -15 || negative.length >= 2) trend = "weak";
  else if (netNewsPct >= 10 || market_events.some((e) => e.impact === "high")) {
    trend = "strong";
  }

  const demand_outlook: DemandOutlook = {
    trend,
    reason:
      news.length > 0
        ? `Net news premium ${netNewsPct >= 0 ? "+" : ""}${netNewsPct}% across ${news.length} headline(s).`
        : market_events.length > 0
          ? `${market_events.length} major event(s) in the analysis window.`
          : "No major demand signals in cached market intel for this window.",
    negative_factors: negative.map((n) => n.headline).slice(0, 5),
    positive_factors: [
      ...positive.map((n) => n.headline),
      ...market_events.filter((e) => e.impact === "high").map((e) => e.title),
    ].slice(0, 5),
    net_news_factor_pct: netNewsPct,
  };

  return {
    market_events: market_events.slice(0, 10),
    news: news.slice(0, 5),
    daily_events: daily_events.slice(0, 10),
    holidays: holidays.slice(0, 5),
    demand_outlook,
  };
}
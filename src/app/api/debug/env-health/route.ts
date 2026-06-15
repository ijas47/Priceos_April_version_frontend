import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/debug/env-health
 * Reports which expected environment variables are set — booleans only,
 * values are never exposed. Session-required.
 */
const EXPECTED_KEYS = [
  // Core
  "MONGODB_URI",
  "JWT_SECRET",
  "JWT_REFRESH_SECRET",
  "NEXT_PUBLIC_API_URL",
  // Hostaway (read-only import)
  "HOSTAWAY_API_BASE_URL",
  "HOSTAWAY_API_KEY",
  "HOSTAWAY_MODE",
  "HOSTAWAY_READ_ONLY",
  "Hostaway_Authorization_token",
  // Lyzr AI agents
  "LYZR_API_KEY",
  "LYZR_API_URL",
  "LYZR_CRO_ROUTER_AGENT_ID",
  "LYZR_PROPERTY_ANALYST_AGENT_ID",
  "LYZR_PRICE_GUARD_AGENT_ID",
  "LYZR_MARKET_RESEARCH_AGENT_ID",
  // Optional feeds
  "EVENTBRITE_API_KEY",
  "TICKETMASTER_API_KEY",
  "DTCM_API_KEY",
  "DTCM_API_BASE_URL",
  "PERPLEXITY_API_KEY",
  "SERP_API_KEY",
  "NEWS_API_KEY",
  "CRON_SECRET",
  "AIRBTICS_API_KEY",
  "AGENT_ID",
] as const;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const health: Record<string, "SET" | "MISSING"> = {};
  for (const key of EXPECTED_KEYS) {
    const value = process.env[key];
    health[key] = value && value.trim().length > 0 ? "SET" : "MISSING";
  }

  const missing = Object.entries(health)
    .filter(([, v]) => v === "MISSING")
    .map(([k]) => k);

  const hostawayMode = (process.env.HOSTAWAY_MODE ?? "db").toLowerCase();
  const hasHostawayToken =
    health.HOSTAWAY_API_KEY === "SET" || health.Hostaway_Authorization_token === "SET";

  const researchFeeds = {
    serp: health.SERP_API_KEY === "SET",
    newsApi: health.NEWS_API_KEY === "SET",
    ticketmaster: health.TICKETMASTER_API_KEY === "SET",
    eventbrite: health.EVENTBRITE_API_KEY === "SET",
    dtcm: health.DTCM_API_KEY === "SET",
    perplexityFallback: health.PERPLEXITY_API_KEY === "SET",
  };
  const hasVerifiedFeed =
    researchFeeds.serp || researchFeeds.ticketmaster || researchFeeds.eventbrite || researchFeeds.dtcm;

  let researchHint: string;
  if (!hasVerifiedFeed) {
    researchHint =
      "No verified event feeds configured — set SERP_API_KEY (minimum) or TICKETMASTER_API_KEY. Without these, setup falls back to Perplexity/Lyzr memory (unverified).";
  } else if (!researchFeeds.serp) {
    researchHint =
      "Ticketed feeds only — add SERP_API_KEY for Google Events/News coverage.";
  } else if (!researchFeeds.newsApi) {
    researchHint =
      "SERP configured — add NEWS_API_KEY for additional demand-signal news.";
  } else {
    researchHint =
      "Verified research feeds ready — Run Aria / Sync Events will use SERP + NewsAPI before any Perplexity fallback.";
  }

  return NextResponse.json({
    summary: missing.length === 0 ? "All expected keys are set" : `${missing.length} keys missing`,
    missing,
    health,
    hostawayMode,
    hostawayReady: hasHostawayToken && hostawayMode === "live",
    hostawayHint: !hasHostawayToken
      ? "Set HOSTAWAY_API_KEY (or Hostaway_Authorization_token) in Vercel"
      : hostawayMode !== "live"
        ? `HOSTAWAY_MODE is "${hostawayMode}" — set it to "live" and redeploy`
        : "Ready — use Sync page → Import from Hostaway",
    researchFeeds,
    researchFeedsReady: hasVerifiedFeed,
    cronReady: health.CRON_SECRET === "SET",
    researchHint,
    note: "Values are never exposed by this endpoint. After changing env vars in Vercel, you must Redeploy for them to take effect.",
  });
}

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
  "PERPLEXITY_API_KEY",
  "SERP_API_KEY",
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

  return NextResponse.json({
    summary: missing.length === 0 ? "All expected keys are set" : `${missing.length} keys missing`,
    missing,
    health,
    hostawayReady:
      health.HOSTAWAY_API_BASE_URL === "SET" &&
      (health.HOSTAWAY_API_KEY === "SET" || health.Hostaway_Authorization_token === "SET") &&
      (process.env.HOSTAWAY_MODE ?? "").toLowerCase() === "live",
    note: "Values are never exposed by this endpoint. After changing env vars in Vercel, you must Redeploy for them to take effect.",
  });
}

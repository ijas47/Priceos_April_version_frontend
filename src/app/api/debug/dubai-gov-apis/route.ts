import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";
import { getDubaiGovApiKey } from "@/lib/research/dubai-gov/client";
import {
  DUBAI_GOV_API_CATALOG,
  getIntegratedDubaiGovApis,
  getPriceOSRelevantApis,
} from "@/lib/research/dubai-gov/registry";

export const dynamic = "force-dynamic";

/**
 * GET /api/debug/dubai-gov-apis
 * Catalog of Dubai Gov portal APIs + integration status. Session-required.
 * Values (API keys) are never exposed.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const hasApiKey = Boolean(getDubaiGovApiKey());
  const integrated = getIntegratedDubaiGovApis();
  const relevant = getPriceOSRelevantApis();

  return NextResponse.json({
    portal: "https://developer.dubai.gov.ae/portal/apis",
    totalApis: DUBAI_GOV_API_CATALOG.length,
    integratedCount: integrated.length,
    relevantForPriceOS: relevant.length,
    hasApiKey,
    envKeys: {
      primary: "DUBAI_GOV_API_KEY",
      aliases: ["DTCM_API_KEY", "DTCM_SUBSCRIPTION_KEY"],
      status: hasApiKey ? "SET" : "MISSING",
    },
    integratedFeeds: integrated.map((a) => ({
      id: a.id,
      name: a.name,
      portalUrl: `https://developer.dubai.gov.ae${a.portalPath}/apiinfo`,
      baseUrl: a.baseUrl,
      category: a.category,
      tags: a.tags,
    })),
    catalog: DUBAI_GOV_API_CATALOG.map((a) => ({
      id: a.id,
      name: a.name,
      category: a.category,
      relevantForPriceOS: a.relevantForPriceOS,
      integrationStatus: a.integrationStatus,
      portalUrl: `https://developer.dubai.gov.ae${a.portalPath}/apiinfo`,
      summary: a.summary,
    })),
    note:
      "Only DTCM CalendarEvents and DCUL CulturalEvents are wired into market intel. Other portal APIs are catalogued for observability.",
  });
}
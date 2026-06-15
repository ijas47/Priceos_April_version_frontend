import { NextRequest, NextResponse } from "next/server";
import { addDays, format } from "date-fns";
import mongoose from "mongoose";
import { connectDB, Listing } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { gatherMarketIntelligence } from "@/lib/research/aggregator";
import { upsertVerifiedFindings } from "@/lib/research/ensure-market-intel";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/v1/system/events/sync
 * Refresh verified event feeds (Ticketmaster, SERP, NewsAPI, annual calendar)
 * for all org listings — no Lyzr agents.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.orgId) {
      return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const daysAhead = Number(body.daysAhead ?? 90);
    const orgId = new mongoose.Types.ObjectId(session.orgId);

    const dateFrom = format(new Date(), "yyyy-MM-dd");
    const dateTo = format(addDays(new Date(), daysAhead), "yyyy-MM-dd");

    await connectDB();

    const listings = await Listing.find({ orgId })
      .select("_id city area countryCode name")
      .lean();

    if (listings.length === 0) {
      return NextResponse.json({
        data: { inserted: 0, updated: 0, listings: 0, sourceBreakdown: {} },
      });
    }

    let totalSaved = 0;
    const mergedBreakdown: Record<string, number> = {};

    for (const listing of listings) {
      const listingId = listing._id as mongoose.Types.ObjectId;
      const city = listing.city || "Dubai";
      const area = listing.area || city;

      const intel = await gatherMarketIntelligence({
        city,
        area: area !== city ? area : undefined,
        countryCode: listing.countryCode || "AE",
        dateFrom,
        dateTo,
      });

      for (const [key, entry] of Object.entries(intel.sourceBreakdown)) {
        if (entry.status === "ok") {
          mergedBreakdown[key] = (mergedBreakdown[key] || 0) + entry.findings;
        }
      }

      const saved = await upsertVerifiedFindings({
        orgId,
        listingId,
        area,
        findings: intel.findings,
      });
      totalSaved += saved;

      if (intel.findings.length > 0) {
        const { MarketEvent } = await import("@/lib/db");
        await MarketEvent.updateMany(
          {
            orgId,
            listingId,
            source: "ai_detected",
            startDate: { $lte: dateTo },
            endDate: { $gte: dateFrom },
            isActive: true,
          },
          { $set: { isActive: false } }
        );
      }
    }

    return NextResponse.json({
      data: {
        inserted: totalSaved,
        updated: 0,
        listings: listings.length,
        window: { from: dateFrom, to: dateTo },
        sourceBreakdown: mergedBreakdown,
        researchSourceErrors: [],
      },
    });
  } catch (error) {
    console.error("[events/sync]", error);
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : "Sync failed" } },
      { status: 500 }
    );
  }
}
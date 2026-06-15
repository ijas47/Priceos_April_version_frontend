import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { syncOrgMarketEvents } from "@/lib/research/sync-org-events";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/v1/system/events/sync
 * Refresh verified event feeds (+ DTCM when Dubai + PMS connected).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.orgId) {
      return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const daysAhead = Number(body.daysAhead ?? 90);

    await connectDB();
    const orgId = new mongoose.Types.ObjectId(session.orgId);
    const result = await syncOrgMarketEvents(orgId, daysAhead);

    return NextResponse.json({
      data: {
        inserted: result.totalSaved,
        updated: 0,
        listings: result.listingsProcessed,
        window: result.window,
        sourceBreakdown: result.sourceBreakdown,
        dtcm: result.dtcm,
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
import { NextRequest, NextResponse } from "next/server";
import { connectDB, Listing } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { runPipeline } from "@/lib/engine/pipeline";
import mongoose from "mongoose";

/**
 * POST /api/engine/run-all
 * Triggers the pricing engine (Pricing Optimizer + Adjustment Reviewer + Channel Sync)
 * for ALL active listings belonging to the authenticated org.
 *
 * Body (optional):
 * {
 *   "trigger": "manual" | "schedule" | "system",
 *   "listingIds": ["id1", "id2"]   // optional: subset of listings
 * }
 *
 * Returns a summary of runs initiated.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const orgId = new mongoose.Types.ObjectId(session.orgId);

    const body = await req.json().catch(() => ({}));
    const trigger = body.trigger || "manual";
    const requestedIds: string[] = body.listingIds || [];

    // Fetch all active listings for this org
    const query = requestedIds.length > 0
      ? {
          orgId,
          _id: { $in: requestedIds.map((id) => new mongoose.Types.ObjectId(id)) },
        }
      : { orgId };

    const listings = await Listing.find(query).select("_id name").lean();

    if (listings.length === 0) {
      return NextResponse.json(
        { error: "No listings found for this organization" },
        { status: 404 }
      );
    }

    type RunResult = {
      listingId: string;
      name: string;
      status: "success" | "failed" | "blocked";
      runId?: string;
      daysChanged?: number;
      error?: string;
      blockReason?: string;
    };

    // Concurrency pool: process up to 5 listings in parallel.
    // The pricing engine itself has no AI calls (waterfall + DB only),
    // so the main bottleneck is bulk-write throughput on MongoDB.
    const CONCURRENCY = 5;
    const results: RunResult[] = [];
    const queue = [...listings];

    async function worker(): Promise<void> {
      while (queue.length > 0) {
        const listing = queue.shift();
        if (!listing) return;
        const listingIdStr = listing._id.toString();
        try {
          const run = await runPipeline(listingIdStr, `${trigger} - engine/run-all`);
          const blocked = run.status === "BLOCKED";
          results.push({
            listingId: listingIdStr,
            name: listing.name || listingIdStr,
            status: blocked ? "blocked" : run.status === "FAILED" ? "failed" : "success",
            runId: run._id?.toString(),
            daysChanged: run.daysChanged || 0,
            blockReason: blocked ? run.errorMessage : undefined,
          });
        } catch (err: any) {
          results.push({
            listingId: listingIdStr,
            name: listing.name || listingIdStr,
            status: "failed",
            error: err?.message || "Pipeline error",
          });
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, listings.length) }, worker));

    const succeeded = results.filter((r) => r.status === "success").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const blocked = results.filter((r) => r.status === "blocked").length;
    const totalDaysChanged = results.reduce((sum, r) => sum + (r.daysChanged || 0), 0);

    return NextResponse.json({
      success: true,
      trigger,
      summary: {
        totalListings: listings.length,
        succeeded,
        failed,
        blocked,
        totalDaysChanged,
      },
      results,
    });
  } catch (error: any) {
    console.error("[engine/run-all]", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}

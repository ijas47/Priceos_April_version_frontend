import { NextRequest, NextResponse } from "next/server";
import { addDays, format } from "date-fns";
import mongoose from "mongoose";
import { connectDB, Listing } from "@/lib/db";
import { ensureVerifiedMarketIntel } from "@/lib/research/ensure-market-intel";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;

  const querySecret = req.nextUrl.searchParams.get("secret");
  return querySecret === secret;
}

/**
 * GET /api/cron/refresh-market-intel
 *
 * Nightly batch refresh of SERP/News/Ticketmaster intel for all listings.
 * Vercel Cron sends Authorization: Bearer $CRON_SECRET when CRON_SECRET is set.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const daysAhead = Number(req.nextUrl.searchParams.get("daysAhead") || 90);
  const limit = Number(req.nextUrl.searchParams.get("limit") || 50);

  const dateFrom = format(new Date(), "yyyy-MM-dd");
  const dateTo = format(addDays(new Date(), daysAhead), "yyyy-MM-dd");

  await connectDB();

  const listings = await Listing.find({})
    .select("_id orgId city area countryCode name")
    .limit(limit)
    .lean();

  const results: Array<{
    listingId: string;
    name: string;
    refreshed: boolean;
    reason: string;
    saved?: number;
    error?: string;
  }> = [];

  for (const listing of listings) {
    const listingId = listing._id as mongoose.Types.ObjectId;
    const orgId = listing.orgId as mongoose.Types.ObjectId;

    try {
      const outcome = await ensureVerifiedMarketIntel({
        orgId,
        listingId,
        city: listing.city || "Dubai",
        area: listing.area || listing.city || "Dubai",
        countryCode: listing.countryCode || "AE",
        dateFrom,
        dateTo,
        force: false,
      });

      results.push({
        listingId: String(listingId),
        name: listing.name || "Listing",
        refreshed: outcome.refreshed,
        reason: outcome.assessment.reason,
        saved: outcome.upsert?.saved,
      });
    } catch (err) {
      results.push({
        listingId: String(listingId),
        name: listing.name || "Listing",
        refreshed: false,
        reason: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const refreshedCount = results.filter((r) => r.refreshed).length;

  return NextResponse.json({
    ok: true,
    window: { from: dateFrom, to: dateTo },
    listingsProcessed: results.length,
    refreshedCount,
    results,
  });
}
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB, InventoryMaster } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { assertListingOwned, ListingAccessError, orgObjectId } from "@/lib/db/assert-listing-owned";
import { format, addDays } from "date-fns";

export const dynamic = "force-dynamic";

/**
 * GET /api/inventory/calendar?listingId=...&days=365
 * Returns per-day pricing data for the pricing calendar heatmap.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const listingId = searchParams.get("listingId");
    const days = Math.min(Number(searchParams.get("days") || 365), 730);

    if (!listingId) {
      return NextResponse.json({ error: "listingId required" }, { status: 400 });
    }

    await connectDB();

    const listing = await assertListingOwned(session.orgId, listingId);
    const lid = listing._id;
    const orgOid = orgObjectId(session.orgId);

    const today = format(new Date(), "yyyy-MM-dd");
    const endDate = format(addDays(new Date(), days), "yyyy-MM-dd");

    const inventory = await InventoryMaster.find({
      orgId: orgOid,
      listingId: lid,
      date: { $gte: today, $lte: endDate },
    })
      .sort({ date: 1 })
      .lean();

    const calendarDays = inventory.map((d) => ({
      date: d.date,
      currentPrice: d.currentPrice || listing.price || 0,
      proposedPrice: d.proposedPrice ?? null,
      proposalStatus: d.proposalStatus ?? null,
      status: d.status || "available",
      changePct:
        d.proposedPrice && d.currentPrice
          ? Math.round(((d.proposedPrice - d.currentPrice) / d.currentPrice) * 100)
          : null,
      reasoning: d.reasoning ?? null,
      minStay: d.minStay ?? null,
    }));

    return NextResponse.json({
      listingId: listing._id.toString(),
      listingName: listing.name,
      basePrice: listing.price || 0,
      currency: listing.currencyCode || "AED",
      priceFloor: listing.priceFloor || 0,
      priceCeiling: listing.priceCeiling || 0,
      totalDays: calendarDays.length,
      days: calendarDays,
    });
  } catch (error) {
    if (error instanceof ListingAccessError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("[Inventory calendar GET]", error);
    return NextResponse.json({ error: "Failed to fetch calendar" }, { status: 500 });
  }
}

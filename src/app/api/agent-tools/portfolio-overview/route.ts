import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB, Listing, InventoryMaster } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { format, addDays } from "date-fns";

export const dynamic = "force-dynamic";

/** GET /api/agent-tools/portfolio-overview?dateFrom&dateTo - occupancy & rate summary. */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get("dateFrom") ?? format(new Date(), "yyyy-MM-dd");
    const dateTo = searchParams.get("dateTo") ?? format(addDays(new Date(), 29), "yyyy-MM-dd");

    const orgOid = new mongoose.Types.ObjectId(session.orgId);
    const [listingCount, inventory] = await Promise.all([
      Listing.countDocuments({ orgId: orgOid }),
      InventoryMaster.find({ orgId: orgOid, date: { $gte: dateFrom, $lte: dateTo } })
        .select("status currentPrice")
        .lean(),
    ]);

    const booked = inventory.filter((d) => d.status === "booked");
    const avgOccupancyPct =
      inventory.length > 0 ? Math.round((booked.length / inventory.length) * 100) : 0;
    const avgNightlyRate =
      inventory.length > 0
        ? Math.round(inventory.reduce((s, d) => s + (d.currentPrice || 0), 0) / inventory.length)
        : 0;
    const bookedRevenue = booked.reduce((s, d) => s + (d.currentPrice || 0), 0);

    return NextResponse.json({
      dateFrom,
      dateTo,
      listingCount,
      totalDays: inventory.length,
      bookedDays: booked.length,
      avgOccupancyPct,
      avgNightlyRate,
      bookedRevenue: Math.round(bookedRevenue),
    });
  } catch (error) {
    console.error("[Agent-tools portfolio-overview]", error);
    return NextResponse.json({ error: "Failed to compute overview" }, { status: 500 });
  }
}

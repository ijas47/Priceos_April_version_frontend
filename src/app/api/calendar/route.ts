import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { format, addDays } from "date-fns";
import { createPMSClient } from "@/lib/pms";
import { connectDB, Listing, InventoryMaster } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import type { CalendarDay } from "@/types/hostaway";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");
    const days = Math.min(Number(searchParams.get("days") || 90), 365);

    if (!propertyId) {
      return NextResponse.json({ error: "propertyId is required" }, { status: 400 });
    }

    const today = new Date();
    const endDate = addDays(today, days);

    // Prefer MongoDB inventory when propertyId is a listing ObjectId
    if (mongoose.Types.ObjectId.isValid(propertyId)) {
      await connectDB();
      const lid = new mongoose.Types.ObjectId(propertyId);
      const listing = await Listing.findOne({
        _id: lid,
        orgId: new mongoose.Types.ObjectId(session.orgId),
      })
        .select("price")
        .lean();

      if (listing) {
        const startStr = format(today, "yyyy-MM-dd");
        const endStr = format(endDate, "yyyy-MM-dd");
        const inventory = await InventoryMaster.find({
          listingId: lid,
          date: { $gte: startStr, $lte: endStr },
        })
          .sort({ date: 1 })
          .lean();

        const fallbackPrice = listing.price || 0;
        const days: CalendarDay[] = inventory.map((d) => ({
          date: d.date,
          status: (d.status === "pending" ? "booked" : d.status) as CalendarDay["status"],
          price: d.currentPrice || fallbackPrice,
          minimumStay: d.minStay ?? 1,
          maximumStay: d.maxStay ?? 30,
        }));

        return NextResponse.json(days);
      }
    }

    const pms = createPMSClient();
    const daysFromPms = await pms.getCalendar(Number(propertyId), today, endDate);

    return NextResponse.json(daysFromPms);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[calendar]", message);
    return NextResponse.json({ error: "Failed to fetch calendar" }, { status: 500 });
  }
}
import { NextRequest, NextResponse } from "next/server";
import { connectDB, Reservation } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { format, addDays } from "date-fns";

export const dynamic = "force-dynamic";

/** GET /api/agent-tools/revenue-snapshot?dateFrom&dateTo - booking revenue totals. */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get("dateFrom") ?? format(new Date(), "yyyy-MM-dd");
    const dateTo = searchParams.get("dateTo") ?? format(addDays(new Date(), 29), "yyyy-MM-dd");

    const reservations = await Reservation.find({
      orgId: session.orgId,
      status: { $ne: "cancelled" },
      checkIn: { $lte: dateTo },
      checkOut: { $gte: dateFrom },
    })
      .select("totalPrice nights channelName")
      .lean();

    const totalRevenue = reservations.reduce((s, r) => s + (r.totalPrice || 0), 0);
    const totalBookings = reservations.length;
    const totalNights = reservations.reduce((s, r) => s + (r.nights || 1), 0);
    const avgBookingValue = totalBookings > 0 ? Math.round(totalRevenue / totalBookings) : 0;

    return NextResponse.json({
      dateFrom,
      dateTo,
      totals: {
        totalRevenue: Math.round(totalRevenue),
        totalBookings,
        totalNights,
        avgBookingValue,
        adr: totalNights > 0 ? Math.round(totalRevenue / totalNights) : 0,
      },
    });
  } catch (error) {
    console.error("[Agent-tools revenue-snapshot]", error);
    return NextResponse.json({ error: "Failed to compute snapshot" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { connectDB, Listing, InventoryMaster, Reservation } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { differenceInDays, format, parseISO, subDays } from "date-fns";

export const dynamic = "force-dynamic";

/**
 * GET /api/properties/analytics?listingId&from&to
 * Matches PropertyAnalyticsResponse parsed by the Properties page.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const listingId = searchParams.get("listingId");
    const from = searchParams.get("from") ?? format(subDays(new Date(), 29), "yyyy-MM-dd");
    const to = searchParams.get("to") ?? format(new Date(), "yyyy-MM-dd");
    if (!listingId) return NextResponse.json({ error: "listingId is required" }, { status: 400 });

    await connectDB();
    const orgId = session.orgId;

    const [listing, inventory, reservations] = await Promise.all([
      Listing.findOne({ _id: listingId, orgId }).select("name").lean(),
      InventoryMaster.find({ orgId, listingId, date: { $gte: from, $lte: to } })
        .select("date status currentPrice")
        .lean(),
      Reservation.find({
        orgId,
        listingId,
        status: { $ne: "cancelled" },
        checkIn: { $lte: to },
        checkOut: { $gte: from },
      })
        .select("checkIn checkOut nights totalPrice channelName createdAt")
        .lean(),
    ]);

    if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });

    // ── Daily map of inventory ────────────────────────────────────────────
    const byDate = new Map(inventory.map((d) => [d.date, d]));
    const days: string[] = [];
    let cursor = parseISO(from);
    const end = parseISO(to);
    while (cursor <= end) {
      days.push(format(cursor, "yyyy-MM-dd"));
      cursor = new Date(cursor.getTime() + 86400000);
    }

    // ── Summary ───────────────────────────────────────────────────────────
    const bookedDays = inventory.filter((d) => d.status === "booked").length;
    const blockedDays = inventory.filter((d) => d.status === "blocked").length;
    const totalDays = days.length;
    const occupancyPct = totalDays > 0 ? Math.round((bookedDays / totalDays) * 100) : 0;
    const totalRevenue = reservations.reduce((s, r) => s + (r.totalPrice || 0), 0);
    const totalBookings = reservations.length;
    const avgLos =
      totalBookings > 0
        ? Math.round((reservations.reduce((s, r) => s + (r.nights || 1), 0) / totalBookings) * 10) / 10
        : 0;
    const avgDailyRevenue = totalDays > 0 ? Math.round(totalRevenue / totalDays) : 0;

    // ── Booking velocity (bookings created per day + 7d moving avg) ──────
    const createdCount = new Map<string, number>();
    for (const r of reservations) {
      const d = r.createdAt ? format(new Date(r.createdAt), "yyyy-MM-dd") : r.checkIn;
      createdCount.set(d, (createdCount.get(d) ?? 0) + 1);
    }
    const bookingVelocity = days.map((date, i) => {
      const bookings = createdCount.get(date) ?? 0;
      const window = days.slice(Math.max(0, i - 6), i + 1);
      const sum = window.reduce((s, d) => s + (createdCount.get(d) ?? 0), 0);
      return { date, bookings, movingAvg7d: Math.round((sum / window.length) * 10) / 10 };
    });

    // ── LOS distribution ──────────────────────────────────────────────────
    const losBuckets = [
      { bucket: "1-2", min: 1, max: 2 },
      { bucket: "3-4", min: 3, max: 4 },
      { bucket: "5-7", min: 5, max: 7 },
      { bucket: "8-14", min: 8, max: 14 },
      { bucket: "15+", min: 15, max: Infinity },
    ];
    const losDistribution = losBuckets.map(({ bucket, min, max }) => ({
      bucket,
      bookings: reservations.filter((r) => (r.nights || 1) >= min && (r.nights || 1) <= max).length,
    }));

    // ── Occupancy trend (weekly buckets keep payload small) ──────────────
    const occupancyTrend = days
      .filter((_, i) => i % 7 === 0)
      .map((date) => {
        const idx = days.indexOf(date);
        const week = days.slice(idx, idx + 7);
        const weekInv = week.map((d) => byDate.get(d)).filter(Boolean);
        const wBooked = weekInv.filter((d) => d!.status === "booked").length;
        const wBlocked = weekInv.filter((d) => d!.status === "blocked").length;
        return {
          date,
          totalDays: week.length,
          bookedDays: wBooked,
          blockedDays: wBlocked,
          occupancyPct: week.length > 0 ? Math.round((wBooked / week.length) * 100) : 0,
        };
      });

    // ── ADR / RevPAR trend ────────────────────────────────────────────────
    const adrRevparTrend = days
      .filter((_, i) => i % 7 === 0)
      .map((date) => {
        const idx = days.indexOf(date);
        const week = days.slice(idx, idx + 7);
        const weekInv = week.map((d) => byDate.get(d)).filter(Boolean);
        const booked = weekInv.filter((d) => d!.status === "booked");
        const bookedRevenue = booked.reduce((s, d) => s + (d!.currentPrice || 0), 0);
        const adr = booked.length > 0 ? Math.round(bookedRevenue / booked.length) : 0;
        const revpar = week.length > 0 ? Math.round(bookedRevenue / week.length) : 0;
        return { date, adr, revpar, bookedRevenue: Math.round(bookedRevenue) };
      });

    // ── Channel mix ───────────────────────────────────────────────────────
    const byChannel = new Map<string, { revenue: number; bookings: number }>();
    for (const r of reservations) {
      const ch = r.channelName || "Direct";
      const cur = byChannel.get(ch) ?? { revenue: 0, bookings: 0 };
      cur.revenue += r.totalPrice || 0;
      cur.bookings += 1;
      byChannel.set(ch, cur);
    }
    const channelMix = Array.from(byChannel.entries()).map(([channel, v]) => ({
      channel,
      revenue: Math.round(v.revenue),
      bookings: v.bookings,
      revenuePct: totalRevenue > 0 ? Math.round((v.revenue / totalRevenue) * 100) : 0,
    }));

    return NextResponse.json({
      listingId,
      propertyName: listing.name,
      dateRange: { from, to },
      summary: { totalBookings, totalRevenue: Math.round(totalRevenue), avgLos, occupancyPct, avgDailyRevenue },
      bookingVelocity,
      losDistribution,
      occupancyTrend,
      adrRevparTrend,
      channelMix,
    });
  } catch (error) {
    console.error("[Properties analytics]", error);
    return NextResponse.json({ error: "Failed to compute analytics" }, { status: 500 });
  }
}

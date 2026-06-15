import { NextRequest, NextResponse } from "next/server";
import { connectDB, Listing, InventoryMaster, Reservation } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { format, parseISO, subDays } from "date-fns";

export const dynamic = "force-dynamic";

const LOS_BUCKETS = [
  { bucket: "1-2", min: 1, max: 2 },
  { bucket: "3-4", min: 3, max: 4 },
  { bucket: "5-7", min: 5, max: 7 },
  { bucket: "8-14", min: 8, max: 14 },
  { bucket: "15+", min: 15, max: Infinity },
];

type InvRow = { date: string; status: string; currentPrice?: number | null };
type ResRow = {
  checkIn: string;
  checkOut: string;
  nights?: number | null;
  totalPrice?: number | null;
  channelName?: string | null;
  createdAt?: Date | string | null;
};

function buildDays(from: string, to: string): string[] {
  const days: string[] = [];
  let cursor = parseISO(from);
  const end = parseISO(to);
  while (cursor <= end) {
    days.push(format(cursor, "yyyy-MM-dd"));
    cursor = new Date(cursor.getTime() + 86400000);
  }
  return days;
}

function computeAnalytics(
  days: string[],
  inventory: InvRow[],
  reservations: ResRow[]
) {
  const byDate = new Map(inventory.map((d) => [d.date, d]));

  const bookedDays = inventory.filter((d) => d.status === "booked").length;
  const blockedDays = inventory.filter((d) => d.status === "blocked").length;
  const denominator = inventory.length > 0 ? inventory.length : days.length;
  const occupancyPct = denominator > 0 ? Math.round((bookedDays / denominator) * 100) : 0;
  const totalRevenue = reservations.reduce((s, r) => s + (r.totalPrice || 0), 0);
  const totalBookings = reservations.length;
  const avgLos =
    totalBookings > 0
      ? Math.round((reservations.reduce((s, r) => s + (r.nights || 1), 0) / totalBookings) * 10) / 10
      : 0;
  const avgDailyRevenue = days.length > 0 ? Math.round(totalRevenue / days.length) : 0;

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

  const losDistribution = LOS_BUCKETS.map(({ bucket, min, max }) => ({
    bucket,
    bookings: reservations.filter((r) => (r.nights || 1) >= min && (r.nights || 1) <= max).length,
  }));

  const occupancyTrend = days
    .filter((_, i) => i % 7 === 0)
    .map((date) => {
      const idx = days.indexOf(date);
      const week = days.slice(idx, idx + 7);
      const weekInv = week.map((d) => byDate.get(d)).filter(Boolean) as InvRow[];
      const wBooked = weekInv.filter((d) => d.status === "booked").length;
      const wBlocked = weekInv.filter((d) => d.status === "blocked").length;
      const wTotal = weekInv.length > 0 ? weekInv.length : week.length;
      return {
        date,
        totalDays: wTotal,
        bookedDays: wBooked,
        blockedDays: wBlocked,
        occupancyPct: wTotal > 0 ? Math.round((wBooked / wTotal) * 100) : 0,
      };
    });

  const adrRevparTrend = days
    .filter((_, i) => i % 7 === 0)
    .map((date) => {
      const idx = days.indexOf(date);
      const week = days.slice(idx, idx + 7);
      const weekInv = week.map((d) => byDate.get(d)).filter(Boolean) as InvRow[];
      const booked = weekInv.filter((d) => d.status === "booked");
      const bookedRevenue = booked.reduce((s, d) => s + (d.currentPrice || 0), 0);
      const adr = booked.length > 0 ? Math.round(bookedRevenue / booked.length) : 0;
      const revpar = weekInv.length > 0 ? Math.round(bookedRevenue / weekInv.length) : 0;
      return { date, adr, revpar, bookedRevenue: Math.round(bookedRevenue) };
    });

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

  return {
    summary: {
      totalBookings,
      totalRevenue: Math.round(totalRevenue),
      avgLos,
      occupancyPct,
      avgDailyRevenue,
      bookedDays,
      blockedDays,
    },
    bookingVelocity,
    losDistribution,
    occupancyTrend,
    adrRevparTrend,
    channelMix,
  };
}

/**
 * GET /api/properties/analytics?listingId&from&to
 *
 * listingId = "portfolio" → aggregate across all org listings.
 * listingId = <id>        → single property (existing behaviour).
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
    const days = buildDays(from, to);
    const isPortfolio = listingId === "portfolio";

    if (isPortfolio) {
      const listings = await Listing.find({ orgId }).select("_id name").lean();
      if (!listings.length) {
        return NextResponse.json({ error: "No properties found" }, { status: 404 });
      }

      const listingIds = listings.map((l) => l._id);
      const nameById = new Map(listings.map((l) => [l._id.toString(), l.name as string]));

      const [inventory, reservations] = await Promise.all([
        InventoryMaster.find({ orgId, listingId: { $in: listingIds }, date: { $gte: from, $lte: to } })
          .select("listingId date status currentPrice")
          .lean(),
        Reservation.find({
          orgId,
          listingId: { $in: listingIds },
          status: { $ne: "cancelled" },
          checkIn: { $lte: to },
          checkOut: { $gte: from },
        })
          .select("listingId checkIn checkOut nights totalPrice channelName createdAt")
          .lean(),
      ]);

      const invRows = inventory.map((d) => ({
        date: d.date,
        status: d.status,
        currentPrice: d.currentPrice,
      }));
      const resRows = reservations.map((r) => ({
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        nights: r.nights,
        totalPrice: r.totalPrice,
        channelName: r.channelName,
        createdAt: r.createdAt,
      }));

      const aggregated = computeAnalytics(days, invRows, resRows);

      const propertyBreakdown = listings
        .map((listing) => {
          const lid = listing._id.toString();
          const inv = inventory.filter((d) => d.listingId.toString() === lid);
          const res = reservations.filter((r) => r.listingId.toString() === lid);
          const metrics = computeAnalytics(days, inv, res);
          return {
            listingId: lid,
            propertyName: nameById.get(lid) || "Unknown",
            totalBookings: metrics.summary.totalBookings,
            totalRevenue: metrics.summary.totalRevenue,
            occupancyPct: metrics.summary.occupancyPct,
            avgLos: metrics.summary.avgLos,
          };
        })
        .filter((p) => p.totalBookings > 0 || p.totalRevenue > 0)
        .sort((a, b) => b.totalRevenue - a.totalRevenue);

      return NextResponse.json({
        listingId: "portfolio",
        propertyName: "Portfolio",
        scope: "portfolio",
        propertyCount: listings.length,
        dateRange: { from, to },
        ...aggregated,
        propertyBreakdown,
      });
    }

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

    const metrics = computeAnalytics(days, inventory, reservations);

    return NextResponse.json({
      listingId,
      propertyName: listing.name,
      scope: "property",
      dateRange: { from, to },
      ...metrics,
    });
  } catch (error) {
    console.error("[Properties analytics]", error);
    return NextResponse.json({ error: "Failed to compute analytics" }, { status: 500 });
  }
}
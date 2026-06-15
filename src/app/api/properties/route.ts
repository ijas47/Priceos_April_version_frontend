import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB, Listing, InventoryMaster, Reservation } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { refreshListingCalendarFromHostaway } from "@/lib/engine/calendar-rates";
import { format, addDays } from "date-fns";

export const dynamic = "force-dynamic";

/**
 * GET /api/properties — listings enriched with occupancy/revenue metrics.
 * Consumed by the Properties page and Guest Inbox.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const orgOid = new mongoose.Types.ObjectId(session.orgId);

    const today = format(new Date(), "yyyy-MM-dd");
    const plus29 = format(addDays(new Date(), 29), "yyyy-MM-dd");

    const [listings, reservations] = await Promise.all([
      Listing.find({ orgId: orgOid }).sort({ name: 1 }).lean(),
      Reservation.find({ orgId: orgOid, status: { $ne: "cancelled" } })
        .select("listingId totalPrice channelName")
        .lean(),
    ]);

    let inventory = await InventoryMaster.find({
      orgId: orgOid,
      date: { $gte: today, $lte: plus29 },
    })
      .select("listingId date status currentPrice")
      .lean();

    const needsRefresh = listings.filter((l) => {
      const hostawayId = (l as { hostawayId?: string }).hostawayId;
      if (!hostawayId) return false;
      const lid = l._id.toString();
      const inv = inventory.filter((r) => r.listingId?.toString() === lid);
      if (inv.length === 0) return true;
      const prices = new Set(inv.map((r) => Number(r.currentPrice || 0)));
      return prices.size <= 1 && prices.has(Number(l.price || 0));
    });

    if (needsRefresh.length > 0) {
      const CONCURRENCY = 4;
      for (let i = 0; i < needsRefresh.length; i += CONCURRENCY) {
        await Promise.all(
          needsRefresh.slice(i, i + CONCURRENCY).map((l) =>
            refreshListingCalendarFromHostaway(
              l._id as mongoose.Types.ObjectId,
              new Date(today),
              new Date(plus29)
            ).catch(() => 0)
          )
        );
      }
      inventory = await InventoryMaster.find({
        orgId: orgOid,
        date: { $gte: today, $lte: plus29 },
      })
        .select("listingId date status currentPrice")
        .lean();
    }

    const properties = listings.map((l) => {
      const lid = l._id.toString();
      const inv = inventory.filter((r) => r.listingId?.toString() === lid);
      const booked = inv.filter((r) => r.status === "booked" || r.status === "pending");
      const occupancyPct = inv.length > 0 ? Math.round((booked.length / inv.length) * 100) : 0;
      const avgPrice =
        inv.length > 0
          ? Math.round(inv.reduce((s, r) => s + (r.currentPrice || 0), 0) / inv.length)
          : l.price || 0;

      const res = reservations.filter((r) => r.listingId?.toString() === lid);
      const totalRevenue = res.reduce((s, r) => s + (r.totalPrice || 0), 0);
      const byChannel = new Map<string, { revenue: number; count: number }>();
      for (const r of res) {
        const ch = r.channelName || "Direct";
        const cur = byChannel.get(ch) ?? { revenue: 0, count: 0 };
        cur.revenue += r.totalPrice || 0;
        cur.count += 1;
        byChannel.set(ch, cur);
      }

      return {
        id: lid,
        _id: lid,
        name: l.name,
        city: l.city || "",
        area: l.area || "",
        bedrooms: l.bedroomsNumber ?? 0,
        bathrooms: l.bathroomsNumber ?? 0,
        basePrice: l.price ?? 0,
        price: avgPrice,
        currency: l.currencyCode || "AED",
        currencyCode: l.currencyCode || "AED",
        priceFloor: l.priceFloor ?? 0,
        priceCeiling: l.priceCeiling ?? 0,
        capacity: (l as unknown as Record<string, unknown>).personCapacity ?? null,
        hostawayId: (l as unknown as Record<string, unknown>).hostawayId ?? null,
        propertyType: "Apartment",
        isActive: l.isActive !== false,
        isActivated: l.isActive !== false,
        occupancyPct,
        occupancy: occupancyPct,
        avgPrice,
        pendingProposals: 0,
        totalReservations: res.length,
        totalRevenue: Math.round(totalRevenue),
        revenueByChannel: Array.from(byChannel.entries()).map(([channel, v]) => ({
          channel,
          revenue: Math.round(v.revenue),
          count: v.count,
        })),
        createdAt: l.createdAt ? new Date(l.createdAt).toISOString() : new Date().toISOString(),
      };
    });

    return NextResponse.json({ properties });
  } catch (error) {
    console.error("[Properties GET]", error);
    return NextResponse.json({ error: "Failed to fetch properties" }, { status: 500 });
  }
}

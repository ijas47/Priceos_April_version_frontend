import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB, InventoryMaster, Reservation } from "@/lib/db";
import { findListingsForOrg } from "@/lib/db/org-scope";
import { getSession } from "@/lib/auth/server";
import { refreshListingCalendarFromHostaway } from "@/lib/engine/calendar-rates";
import { resolveDisplayRate } from "@/lib/pricing/display-rate";
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

    const today = format(new Date(), "yyyy-MM-dd");
    const plus29 = format(addDays(new Date(), 29), "yyyy-MM-dd");

    const listings = await findListingsForOrg(session.orgId, { repair: true });
    const listingIds = listings.map((l) => l._id);

    const [reservations, inventoryInitial] = await Promise.all([
      listingIds.length > 0
        ? Reservation.find({
            listingId: { $in: listingIds },
            status: { $ne: "cancelled" },
          })
            .select("listingId totalPrice channelName")
            .lean()
        : [],
      listingIds.length > 0
        ? InventoryMaster.find({
            listingId: { $in: listingIds },
            date: { $gte: today, $lte: plus29 },
          })
            .select("listingId date status currentPrice")
            .lean()
        : [],
    ]);

    let inventory = inventoryInitial;

    const needsRefresh = listings.filter((l) => {
      const hostawayId = (l as { hostawayId?: string }).hostawayId;
      if (!hostawayId) return false;
      const lid = l._id.toString();
      const inv = inventory.filter((r) => r.listingId?.toString() === lid);
      if (inv.length === 0) return true;
      const dbPrice = Number(l.price || 0);
      const calendarPrices = inv
        .map((r) => Number(r.currentPrice || 0))
        .filter((p) => p > 0);
      if (calendarPrices.length === 0) return true;
      const unique = new Set(calendarPrices.map((p) => Math.round(p)));
      if (unique.size > 1) return false;
      const calendarRate = calendarPrices[0];
      return dbPrice <= 0 || Math.round(calendarRate) !== Math.round(dbPrice);
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
      inventory =
        listingIds.length > 0
          ? await InventoryMaster.find({
              listingId: { $in: listingIds },
              date: { $gte: today, $lte: plus29 },
            })
              .select("listingId date status currentPrice")
              .lean()
          : [];
    }

    const properties = listings.map((l) => {
      const lid = l._id.toString();
      const inv = inventory.filter((r) => r.listingId?.toString() === lid);
      const booked = inv.filter((r) => r.status === "booked" || r.status === "pending");
      const occupancyPct = inv.length > 0 ? Math.round((booked.length / inv.length) * 100) : 0;
      const listedPrice = Number(l.price ?? 0);
      const calendarPrices = inv.map((r) => Number(r.currentPrice || 0));
      const todayInv = inv.find((r) => r.date === today);
      const calendarListedPrice = todayInv
        ? Number(todayInv.currentPrice || 0)
        : Number(inv.find((r) => Number(r.currentPrice) > 0)?.currentPrice || 0);
      const avgCalendarRaw =
        inv.length > 0
          ? inv.reduce((s, r) => s + Number(r.currentPrice || 0), 0) / inv.length
          : null;
      const rateDisplay = resolveDisplayRate({
        listedPrice,
        calendarPrices,
        avgCalendarRate: avgCalendarRaw,
        calendarListedPrice,
      });

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
        basePrice: listedPrice,
        listedPrice: rateDisplay.listedPrice,
        avgCalendarRate: rateDisplay.avgCalendarRate,
        displayRate: rateDisplay.displayRate,
        rateLabel: rateDisplay.rateLabel,
        price: rateDisplay.displayRate,
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
        avgPrice: rateDisplay.displayRate,
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

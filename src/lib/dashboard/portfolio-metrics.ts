import { addDays, format } from "date-fns";
import { connectDB, InventoryMaster, Reservation } from "@/lib/db";
import { findListingsForOrg } from "@/lib/db/org-scope";
import { resolveDisplayRate } from "@/lib/pricing/display-rate";

export interface DashboardPropertyMetric {
  id: string;
  name: string;
  area: string;
  bedroomsNumber?: number;
  price: number;
  currencyCode: string;
  occupancy: number;
  avgPrice: number;
  revenue: number;
  projectedRevenue: number;
  calendarDays: {
    date: string;
    status: string;
    price: number;
    minimumStay?: number;
    maximumStay?: number;
  }[];
  reservations: {
    title: string;
    email?: string;
    startDate: string;
    endDate: string;
    financials: {
      totalPrice: number;
      pricePerNight: number;
      channelName?: string;
      reservationStatus?: string;
    };
  }[];
}

export interface PortfolioDashboardData {
  properties: DashboardPropertyMetric[];
  totalProperties: number;
  avgPortfolioOccupancy: number;
  avgPortfolioPrice: number;
  totalPortfolioRevenue: number;
  totalHistoricalRevenue: number;
  projectedPortfolioRevenue: number;
}

function dayPrice(row: {
  currentPrice?: number | string | null;
  proposedPrice?: number | string | null;
}): number {
  const proposed = Number(row.proposedPrice ?? 0);
  if (proposed > 0) return proposed;
  return Number(row.currentPrice ?? 0);
}

/**
 * Load portfolio dashboard metrics directly from MongoDB.
 * Avoids server-side self-fetch to /api (fragile on Vercel when env/cookies misalign).
 */
export async function loadPortfolioDashboardData(
  orgId: string
): Promise<PortfolioDashboardData> {
  await connectDB();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = format(today, "yyyy-MM-dd");
  const plus29Str = format(addDays(today, 29), "yyyy-MM-dd");
  const minus365Str = format(addDays(today, -365), "yyyy-MM-dd");

  const listings = await findListingsForOrg(orgId, { repair: true });
  const listingIds = listings.map((l) => l._id);

  const [inventory, reservations] = await Promise.all([
    listingIds.length > 0
      ? InventoryMaster.find({
          listingId: { $in: listingIds },
          date: { $gte: todayStr, $lte: plus29Str },
        })
          .select("listingId date status currentPrice proposedPrice minStay maxStay")
          .lean()
      : [],
    listingIds.length > 0
      ? Reservation.find({
          listingId: { $in: listingIds },
          status: { $ne: "cancelled" },
          checkIn: { $lte: plus29Str },
          checkOut: { $gte: minus365Str },
        })
          .select("listingId guestName guestEmail checkIn checkOut totalPrice nights channelName status")
          .lean()
      : [],
  ]);

  let totalHistoricalRevenue = 0;
  let totalProjectedRevenue = 0;
  let totalOccupancySum = 0;
  let totalAvgPriceSum = 0;

  const properties: DashboardPropertyMetric[] = listings.map((listing) => {
    const listingId = listing._id.toString();
    const listingInv = inventory.filter((r) => r.listingId?.toString() === listingId);
    const bookedInv = listingInv.filter(
      (r) => r.status === "booked" || r.status === "pending"
    );
    const totalDays = listingInv.length;
    const occupancy =
      totalDays > 0 ? Math.round((bookedInv.length / totalDays) * 100) : 0;

    const listingReservations = reservations.filter(
      (r) => r.listingId?.toString() === listingId
    );

    const adrEntries = listingReservations
      .filter((r) => Number(r.totalPrice) > 0 && Number(r.nights) > 0)
      .map((r) => Number(r.totalPrice) / Number(r.nights));

    const calendarPrices = listingInv.map((r) => dayPrice(r));
    const todayInv = listingInv.find((r) => r.date === todayStr);
    const firstPricedInv = listingInv.find((r) => dayPrice(r) > 0);
    const calendarListedPrice = todayInv
      ? dayPrice(todayInv)
      : firstPricedInv
        ? dayPrice(firstPricedInv)
        : 0;

    const avgCalendarRaw =
      calendarPrices.filter((p) => p > 0).length > 0
        ? calendarPrices.filter((p) => p > 0).reduce((s, p) => s + p, 0) /
          calendarPrices.filter((p) => p > 0).length
        : null;

    const rateDisplay = resolveDisplayRate({
      listedPrice: Number(listing.price ?? 0),
      calendarPrices,
      avgCalendarRate: avgCalendarRaw,
      calendarListedPrice,
    });

    const avgPrice =
      adrEntries.length > 0
        ? Math.round(adrEntries.reduce((a, b) => a + b, 0) / adrEntries.length)
        : Math.round(rateDisplay.displayRate);

    const revenue = listingReservations.reduce(
      (sum, r) => sum + Number(r.totalPrice ?? 0),
      0
    );
    const projectedRevenue = listingReservations
      .filter((r) => r.checkIn >= todayStr && r.checkIn <= plus29Str)
      .reduce((sum, r) => sum + Number(r.totalPrice ?? 0), 0);

    totalHistoricalRevenue += revenue;
    totalProjectedRevenue += projectedRevenue;
    totalOccupancySum += occupancy;
    totalAvgPriceSum += avgPrice;

    const calendarDays = listingInv.map((r) => ({
      date: r.date,
      status: r.status,
      price: dayPrice(r),
      minimumStay: Number(r.minStay ?? 1),
      maximumStay: Number(r.maxStay ?? 30),
    }));

    const listingRes = listingReservations.map((r) => ({
      title: r.guestName ?? "Guest",
      email: r.guestEmail ?? undefined,
      startDate: r.checkIn,
      endDate: r.checkOut,
      financials: {
        totalPrice: Number(r.totalPrice ?? 0),
        pricePerNight:
          Number(r.nights) > 0
            ? Math.round(Number(r.totalPrice) / Number(r.nights))
            : Number(r.totalPrice ?? 0),
        channelName: r.channelName ?? undefined,
        reservationStatus: r.status ?? undefined,
      },
    }));

    return {
      id: listingId,
      name: listing.name,
      area: listing.area ?? "",
      bedroomsNumber: listing.bedroomsNumber ?? undefined,
      price: rateDisplay.displayRate,
      currencyCode: listing.currencyCode ?? "AED",
      occupancy,
      avgPrice,
      revenue: Math.round(revenue),
      projectedRevenue: Math.round(projectedRevenue),
      calendarDays,
      reservations: listingRes,
    };
  });

  const count = properties.length;
  const avgPortfolioOccupancy =
    count > 0 ? Math.round(totalOccupancySum / count) : 0;
  const avgPortfolioPrice =
    count > 0 ? Math.round(totalAvgPriceSum / count) : 0;

  return {
    properties,
    totalProperties: count,
    avgPortfolioOccupancy,
    avgPortfolioPrice,
    totalPortfolioRevenue: Math.round(totalProjectedRevenue),
    totalHistoricalRevenue: Math.round(totalHistoricalRevenue),
    projectedPortfolioRevenue: Math.round(totalProjectedRevenue),
  };
}
import mongoose from "mongoose";
import { createPMSClient } from "@/lib/pms";
import { connectDB, InventoryMaster, Listing } from "@/lib/db";
import { syncCalendarToDb } from "@/lib/sync-server-utils";

function toNum(val: string | number | null | undefined): number {
  if (val === null || val === undefined) return 0;
  return typeof val === "string" ? parseFloat(val) : val;
}

/** Pull latest per-day rates from Hostaway into InventoryMaster (live mode only). */
export async function refreshListingCalendarFromHostaway(
  listingId: mongoose.Types.ObjectId | string,
  startDate: Date,
  endDate: Date
): Promise<void> {
  await connectDB();
  const lid =
    typeof listingId === "string"
      ? new mongoose.Types.ObjectId(listingId)
      : listingId;

  const listing = await Listing.findById(lid).select("hostawayId").lean();
  if (!listing?.hostawayId) return;

  const client = createPMSClient();
  if (client.getMode() !== "live") return;

  await syncCalendarToDb(
    client,
    [lid],
    startDate,
    endDate,
    Number(listing.hostawayId)
  );
}

/** Average synced calendar rate for a listing over a date window. */
export async function getCalendarAvgPrice(
  listingId: mongoose.Types.ObjectId | string,
  dateFrom: string,
  dateTo: string
): Promise<number> {
  await connectDB();
  const lid =
    typeof listingId === "string"
      ? new mongoose.Types.ObjectId(listingId)
      : listingId;

  const [agg] = await InventoryMaster.aggregate([
    {
      $match: {
        listingId: lid,
        date: { $gte: dateFrom, $lte: dateTo },
        currentPrice: { $gt: 0 },
      },
    },
    { $group: { _id: null, avgPrice: { $avg: "$currentPrice" } } },
  ]);

  return toNum(agg?.avgPrice);
}

export function buildCalendarPriceMap(
  rows: Array<{ date: string; currentPrice?: string | number | null }>,
  fallbackPrice: number
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const price = toNum(row.currentPrice);
    if (price > 0) map.set(row.date, price);
  }
  if (fallbackPrice > 0 && map.size === 0) {
    // no-op: caller uses fallback per-day
  }
  return map;
}

export function resolveDayCalendarPrice(
  date: string,
  priceByDate: Map<string, number>,
  listingFallbackPrice: number
): number {
  const calendarPrice = priceByDate.get(date);
  if (calendarPrice && calendarPrice > 0) return calendarPrice;
  return listingFallbackPrice > 0 ? listingFallbackPrice : 0;
}
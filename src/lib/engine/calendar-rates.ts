import mongoose from "mongoose";
import { format } from "date-fns";
import { createHostawayClient } from "@/lib/hostaway/client";
import { getHostawayApiKey } from "@/lib/env";
import { resolveHostawayApiKey } from "@/lib/listing-content/hostaway-key";
import { connectDB, InventoryMaster, Listing } from "@/lib/db";

function toNum(val: string | number | null | undefined): number {
  if (val === null || val === undefined) return 0;
  return typeof val === "string" ? parseFloat(val) : val;
}

function mapCalendarStatus(
  status: string
): "available" | "booked" | "blocked" | "pending" {
  if (status === "booked") return "booked";
  if (status === "blocked") return "blocked";
  return "available";
}

/**
 * Pull latest per-day rates from Hostaway into InventoryMaster.
 * Uses org/env API key directly — does not require HOSTAWAY_MODE=live.
 */
export async function refreshListingCalendarFromHostaway(
  listingId: mongoose.Types.ObjectId | string,
  startDate: Date,
  endDate: Date
): Promise<number> {
  await connectDB();
  const lid =
    typeof listingId === "string"
      ? new mongoose.Types.ObjectId(listingId)
      : listingId;

  const listing = await Listing.findById(lid).select("hostawayId orgId").lean();
  if (!listing?.hostawayId) return 0;

  const apiKey =
    (listing.orgId ? await resolveHostawayApiKey(listing.orgId) : null) ||
    getHostawayApiKey();
  if (!apiKey) {
    console.warn("[calendar-rates] no Hostaway API key — skipping calendar refresh");
    return 0;
  }

  const client = createHostawayClient(apiKey);
  const calendarData = await client.getCalendar(
    Number(listing.hostawayId),
    format(startDate, "yyyy-MM-dd"),
    format(endDate, "yyyy-MM-dd")
  );

  if (calendarData.length === 0) return 0;

  const orgId = listing.orgId || new mongoose.Types.ObjectId();
  const bulkOps = calendarData
    .filter((day) => day.date && day.price > 0)
    .map((day) => ({
      updateOne: {
        filter: { listingId: lid, date: day.date },
        update: {
          $set: {
            orgId,
            listingId: lid,
            date: day.date,
            status: mapCalendarStatus(day.status),
            currentPrice: day.price,
            minStay: day.minimumStay || 1,
            maxStay: day.maximumStay || 30,
          },
        },
        upsert: true,
      },
    }));

  if (bulkOps.length === 0) return 0;

  for (let i = 0; i < bulkOps.length; i += 100) {
    await InventoryMaster.bulkWrite(bulkOps.slice(i, i + 100));
  }

  return bulkOps.length;
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
  _fallbackPrice: number
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const price = toNum(row.currentPrice);
    if (price > 0) map.set(row.date, price);
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
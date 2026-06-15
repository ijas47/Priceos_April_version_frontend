import mongoose from "mongoose";
import { connectDB, Reservation } from "@/lib/db";
import { subMonths, format } from "date-fns";

/** Booking share by channel for the last 12 months (confirmed reservations). */
export async function getChannelMix(
  orgId: mongoose.Types.ObjectId,
  listingId: mongoose.Types.ObjectId
): Promise<Record<string, number>> {
  await connectDB();
  const since = format(subMonths(new Date(), 12), "yyyy-MM-dd");

  const rows = await Reservation.aggregate([
    {
      $match: {
        orgId,
        listingId,
        checkIn: { $gte: since },
        status: { $nin: ["cancelled"] },
      },
    },
    { $group: { _id: "$channelName", count: { $sum: 1 } } },
  ]);

  const total = rows.reduce((s, r) => s + r.count, 0) || 1;
  const mix: Record<string, number> = {};
  for (const r of rows) {
    const key = normalizeChannel(String(r._id || "other"));
    mix[key] = Math.round((r.count / total) * 100);
  }
  return mix;
}

function normalizeChannel(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("airbnb")) return "airbnb";
  if (n.includes("booking")) return "booking_com";
  if (n.includes("vrbo") || n.includes("homeaway")) return "vrbo";
  if (n === "direct") return "direct";
  return "other";
}
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { connectDB, Listing, InventoryMaster, Reservation } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { SAMPLE_LISTINGS_SEED } from "@/lib/db/seed/listings";
import { runAutoSetup } from "@/lib/engine/auto-setup";
import { format, addDays, subDays } from "date-fns";

export const dynamic = "force-dynamic";

const CHANNELS = ["Airbnb", "Booking.com", "Direct", "Airbnb", "Booking.com"];
const GUESTS = [
  "Sarah Mitchell", "Ahmed Al-Rashid", "James Chen", "Elena Petrova", "Omar Hassan",
  "Lucy Bennett", "Raj Patel", "Maria Garcia", "Tom Wilson", "Fatima Khan",
];

/**
 * GET /api/onboarding/seed-demo
 * Seeds the 5 sample Dubai listings + 120 days of inventory + reservations
 * for the CALLER'S org. Idempotent: skips if the org already has listings.
 * Redirects to /dashboard when done.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    await connectDB();
    const orgId = session.orgId;

    const existing = await Listing.countDocuments({ orgId });
    if (existing > 0) {
      // Already has data - nothing to do.
      return NextResponse.redirect(new URL("/dashboard?seeded=existing", req.url));
    }

    const today = new Date();

    for (let li = 0; li < SAMPLE_LISTINGS_SEED.length; li++) {
      const seed = SAMPLE_LISTINGS_SEED[li];
      // hostawayId is unique across orgs - namespace per org to stay idempotent globally
      const listing = await Listing.create({
        ...seed,
        hostawayId: `${seed.hostawayId}_${orgId.slice(-6)}`,
        orgId,
      } as any);

      const basePrice = (seed as any).price ?? 500;

      // ── Reservations: ~15 spread over past 150 days and next 30 ──────────
      const reservations: any[] = [];
      const bookedDates = new Set<string>();
      for (let r = 0; r < 15; r++) {
        const offset = Math.floor(Math.random() * 180) - 150; // -150..+30
        const checkInDate = addDays(today, offset);
        const nights = 1 + Math.floor(Math.random() * 6);
        const checkIn = format(checkInDate, "yyyy-MM-dd");
        const checkOut = format(addDays(checkInDate, nights), "yyyy-MM-dd");
        const nightly = Math.round(basePrice * (0.85 + Math.random() * 0.4));

        for (let n = 0; n < nights; n++) {
          bookedDates.add(format(addDays(checkInDate, n), "yyyy-MM-dd"));
        }

        reservations.push({
          orgId,
          listingId: listing._id,
          guestName: GUESTS[(li * 7 + r) % GUESTS.length],
          checkIn,
          checkOut,
          nights,
          guests: 1 + Math.floor(Math.random() * 3),
          totalPrice: nightly * nights,
          channelName: CHANNELS[(li + r) % CHANNELS.length],
          status: offset + nights < 0 ? "checked_out" : "confirmed",
        });
      }
      await Reservation.insertMany(reservations);

      // ── Inventory: past 30 days through next 90 ──────────────────────────
      const inventory: any[] = [];
      for (let d = -30; d < 90; d++) {
        const date = format(addDays(today, d), "yyyy-MM-dd");
        const isWeekend = [4, 5].includes(addDays(today, d).getDay()); // Thu/Fri Dubai
        const price = Math.round(basePrice * (isWeekend ? 1.2 : 1) * (0.9 + Math.random() * 0.2));
        let status: string;
        if (bookedDates.has(date)) status = "booked";
        else if (Math.random() < 0.04) status = "blocked";
        else status = "available";

        inventory.push({
          orgId,
          listingId: listing._id,
          date,
          currentPrice: price,
          basePrice,
          status,
          minStay: 1,
        });
      }
      await InventoryMaster.insertMany(inventory);
    }

    // sanity reference so the demo window stays anchored to seed time
    console.log(`[seed-demo] Seeded org ${orgId} at ${format(subDays(today, 0), "yyyy-MM-dd")}`);

    // Auto-setup: configure pricing defaults + run engine (non-blocking)
    const allListingIds = await Listing.find({ orgId }).select("_id").lean();
    runAutoSetup({
      orgId: String(orgId),
      listingIds: allListingIds.map((l) => l._id.toString()),
      marketCode: "UAE_DXB",
      strategy: "balanced",
    }).catch((err) => console.error("[seed-demo] auto-setup:", err.message));

    return NextResponse.redirect(new URL("/dashboard?seeded=1", req.url));
  } catch (error: any) {
    console.error("[seed-demo]", error);
    return NextResponse.json({ error: error?.message ?? "Seed failed" }, { status: 500 });
  }
}

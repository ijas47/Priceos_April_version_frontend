import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAccessToken } from "@/lib/auth/jwt";
import {
  fitElasticityModel,
  elasticityCurve,
  optimalPrice,
} from "@/lib/elasticity/model";
import type { BookingObservation } from "@/lib/elasticity/types";
import { differenceInDays, parseISO, format, subDays, getDay } from "date-fns";
import { connectDB, Listing } from "@/lib/db";
import { getMarketContext, resolveMarketId } from "@/lib/airbtics/market-context";

const RAW_BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

/** Resolve the backend base to an absolute URL (handles NEXT_PUBLIC_API_URL=/api). */
function backendBase(req: NextRequest): string {
  if (RAW_BACKEND.startsWith("http")) return RAW_BACKEND;
  return `${req.nextUrl.origin}${RAW_BACKEND}`.replace(/\/$/, "");
}

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

const FitRequestSchema = z.object({
  listingId: z.string().min(1),
  orgId: z.string().min(1).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  floor: z.coerce.number().positive().optional(),
  ceiling: z.coerce.number().positive().optional(),
});

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    // Auth
    const token = req.cookies.get("priceos-session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const payload = verifyAccessToken(token);

    // Parse & validate query params
    const params = Object.fromEntries(req.nextUrl.searchParams.entries());
    const parsed = FitRequestSchema.safeParse(params);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid parameters", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const { listingId } = parsed.data;
    const orgId = parsed.data.orgId ?? payload.orgId;

    // Default date range: past 180 days (for historical booking data)
    const today = new Date();
    const dateFrom = parsed.data.dateFrom ?? format(subDays(today, 180), "yyyy-MM-dd");
    const dateTo = parsed.data.dateTo ?? format(today, "yyyy-MM-dd");

    // Default price bounds
    const floor = parsed.data.floor ?? 100;
    const ceiling = parsed.data.ceiling ?? 3000;

    // -----------------------------------------------------------------------
    // 1. Fetch booking history from backend
    // -----------------------------------------------------------------------
    const reservationsUrl =
      `${backendBase(req)}/agent-tools/property-reservations` +
      `?orgId=${encodeURIComponent(orgId)}` +
      `&listingId=${encodeURIComponent(listingId)}` +
      `&dateFrom=${encodeURIComponent(dateFrom)}` +
      `&dateTo=${encodeURIComponent(dateTo)}` +
      `&limit=500`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let reservations: any[] = [];
    try {
      const reservationsRes = await fetch(reservationsUrl);
      if (reservationsRes.ok) {
        const data = await reservationsRes.json();
        reservations = Array.isArray(data)
          ? data
          : Array.isArray(data.reservations)
            ? data.reservations
            : [];
      }
    } catch {
      // Booking history unavailable - model falls back to cold-start defaults
    }

    // -----------------------------------------------------------------------
    // 2. Fetch Airbtics market ADR directly (cold-start fallback)
    // -----------------------------------------------------------------------
    let airbticAdr: number | undefined;
    try {
      await connectDB();
      const listing = await Listing.findById(listingId).lean();
      const city = listing?.city || "Dubai";
      const cc = listing?.countryCode || "AE";
      const { resolveBedroomsNumber } = await import("@/lib/pricing/bedrooms");
      const br = String(resolveBedroomsNumber(listing?.bedroomsNumber, 1));
      const mktId = await resolveMarketId(city, cc);
      if (mktId) {
        const ctx = await getMarketContext(mktId, br);
        if (ctx.p50ADR) airbticAdr = Math.round(ctx.p50ADR);
      }
    } catch {
      // Non-fatal - model falls back to cold-start defaults
    }

    // -----------------------------------------------------------------------
    // 3. Transform reservations into BookingObservations
    // -----------------------------------------------------------------------
    const observations = buildObservations(reservations, dateFrom, dateTo);

    // -----------------------------------------------------------------------
    // 4. Fit the model
    // -----------------------------------------------------------------------
    const elasticityParams = fitElasticityModel(observations, airbticAdr);

    // -----------------------------------------------------------------------
    // 5. Generate curve + optimal price
    // -----------------------------------------------------------------------
    const curve = elasticityCurve(elasticityParams, floor, ceiling);
    const optimal = optimalPrice(elasticityParams, floor, ceiling);

    return NextResponse.json({
      params: elasticityParams,
      curve,
      optimal,
    });
  } catch (err) {
    console.error("[elasticity/fit GET]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build booking observations from reservation data.
 *
 * For each date in the range, determine if it was booked or available.
 * Reservations provide booked dates; gaps are unbooked.
 */
function buildObservations(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reservations: any[],
  dateFrom: string,
  dateTo: string,
): BookingObservation[] {
  const today = new Date();
  const start = parseISO(dateFrom);
  const end = parseISO(dateTo);

  // Build a set of booked dates with their prices.
  const bookedMap = new Map<string, number>();

  for (const res of reservations) {
    if (!res.arrivalDate || !res.departureDate) continue;
    if (res.status === "cancelled") continue;

    const arrival = parseISO(res.arrivalDate);
    const departure = parseISO(res.departureDate);
    const nights = Math.max(1, differenceInDays(departure, arrival));
    const nightlyRate = (res.totalPrice ?? res.price ?? 0) / nights;

    // Mark each night as booked.
    for (let d = 0; d < nights; d++) {
      const date = new Date(arrival);
      date.setDate(date.getDate() + d);
      const key = format(date, "yyyy-MM-dd");
      bookedMap.set(key, nightlyRate);
    }
  }

  // Build observations for every date in the range.
  const observations: BookingObservation[] = [];
  const totalDays = differenceInDays(end, start);

  // Compute a fallback price for unbooked dates (median of booked prices).
  const bookedPrices = Array.from(bookedMap.values()).sort((a, b) => a - b);
  const medianPrice =
    bookedPrices.length > 0
      ? bookedPrices[Math.floor(bookedPrices.length / 2)]
      : 500; // ultimate fallback

  for (let d = 0; d <= totalDays; d++) {
    const date = new Date(start);
    date.setDate(date.getDate() + d);
    const key = format(date, "yyyy-MM-dd");
    const dayOfWeek = getDay(date); // 0 = Sun, 5 = Fri, 6 = Sat
    const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
    const leadTime = differenceInDays(date, today);

    const booked = bookedMap.has(key);
    const price = booked ? bookedMap.get(key)! : medianPrice;

    observations.push({
      date: key,
      price: Math.round(price * 100) / 100,
      booked,
      leadTimeDays: Math.max(0, leadTime),
      isWeekend,
    });
  }

  return observations;
}

import { parseISO, isWeekend } from "date-fns";
import type { BookingPaceSummary } from "@/lib/pricing/booking-pace";
import type { MarketContext } from "@/lib/airbtics/market-context";
import { computeDaysSinceLastBooking } from "@/lib/pricing/booking-recency";

const ACTIVE_STATUSES = new Set([
  "confirmed",
  "pending",
  "checked_in",
  "checked_out",
]);

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface ReservationIntelRow {
  checkIn: string;
  checkOut: string;
  nights: number;
  totalPrice: number;
  channelName?: string | null;
  status?: string | null;
  createdAt?: Date | string | null;
}

export type VelocityTrend = "accelerating" | "stable" | "decelerating";

export function resolveVelocityTrend(
  occupancyPct: number,
  paceRatio: number | null
): VelocityTrend {
  if (paceRatio != null) {
    if (paceRatio >= 1.1 || (occupancyPct >= 50 && paceRatio >= 0.95)) {
      return "accelerating";
    }
    if (paceRatio < 0.85 || occupancyPct < 30) {
      return "decelerating";
    }
    return "stable";
  }
  if (occupancyPct > 50) return "accelerating";
  if (occupancyPct < 30) return "decelerating";
  return "stable";
}

function isActiveReservation(status: string | null | undefined): boolean {
  return ACTIVE_STATUSES.has(status ?? "confirmed");
}

function daysBetweenIso(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00Z`).getTime();
  const b = new Date(`${to}T12:00:00Z`).getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function toIsoDate(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === "string") return d.split("T")[0];
  return d.toISOString().split("T")[0];
}

function countRecentBookings(
  rows: ReservationIntelRow[],
  asOfIso: string,
  lookbackDays: number
): number {
  const asOf = new Date(`${asOfIso}T12:00:00Z`).getTime();
  const cutoff = asOf - lookbackDays * 24 * 60 * 60 * 1000;
  return rows.filter((r) => {
    if (!isActiveReservation(r.status)) return false;
    const created = r.createdAt ? new Date(r.createdAt).getTime() : null;
    return created != null && created >= cutoff && created <= asOf + 24 * 60 * 60 * 1000;
  }).length;
}

function buildLeadTimeDistribution(rows: ReservationIntelRow[], asOfIso: string) {
  const buckets = [
    { bucket: "0-3 days", min: 0, max: 3, count: 0 },
    { bucket: "4-7 days", min: 4, max: 7, count: 0 },
    { bucket: "8-14 days", min: 8, max: 14, count: 0 },
    { bucket: "15-30 days", min: 15, max: 30, count: 0 },
    { bucket: "31+ days", min: 31, max: 9999, count: 0 },
  ];

  for (const r of rows) {
    if (!isActiveReservation(r.status)) continue;
    const bookedOn = toIsoDate(r.createdAt);
    if (!bookedOn) continue;
    const lead = daysBetweenIso(bookedOn, r.checkIn);
    if (lead < 0) continue;
    const slot = buckets.find((b) => lead >= b.min && lead <= b.max);
    if (slot) slot.count += 1;
  }

  const total = buckets.reduce((s, b) => s + b.count, 0);
  return buckets.map((b) => ({
    bucket: b.bucket,
    count: b.count,
    pct: total > 0 ? Math.round((b.count / total) * 1000) / 10 : 0,
  }));
}

function buildLosBuckets(rows: ReservationIntelRow[]) {
  const buckets = [
    { range: "1 night", count: 0, nights: 0, revenue: 0 },
    { range: "2-4 nights", count: 0, nights: 0, revenue: 0 },
    { range: "5+ nights", count: 0, nights: 0, revenue: 0 },
  ];

  for (const r of rows) {
    if (!isActiveReservation(r.status)) continue;
    const n = r.nights || 1;
    const price = Number(r.totalPrice || 0);
    if (n === 1) {
      buckets[0].count += 1;
      buckets[0].nights += n;
      buckets[0].revenue += price;
    } else if (n <= 4) {
      buckets[1].count += 1;
      buckets[1].nights += n;
      buckets[1].revenue += price;
    } else {
      buckets[2].count += 1;
      buckets[2].nights += n;
      buckets[2].revenue += price;
    }
  }

  return buckets.map((b) => ({
    range: b.range,
    count: b.count,
    avg_price: b.count > 0 ? Math.round((b.revenue / b.count) * 100) / 100 : 0,
  }));
}

function buildChannelMix(rows: ReservationIntelRow[]) {
  const byChannel = new Map<
    string,
    { bookings: number; revenue: number; nights: number }
  >();

  for (const r of rows) {
    if (!isActiveReservation(r.status)) continue;
    const ch = r.channelName?.trim() || "Direct";
    const cur = byChannel.get(ch) ?? { bookings: 0, revenue: 0, nights: 0 };
    cur.bookings += 1;
    cur.revenue += Number(r.totalPrice || 0);
    cur.nights += r.nights || 1;
    byChannel.set(ch, cur);
  }

  return [...byChannel.entries()]
    .map(([channel, v]) => ({
      channel,
      bookings: v.bookings,
      revenue: Math.round(v.revenue * 100) / 100,
      avg_los: v.bookings > 0 ? Math.round((v.nights / v.bookings) * 100) / 100 : 0,
      pct_of_bookings:
        rows.filter((r) => isActiveReservation(r.status)).length > 0
          ? Math.round(
              (v.bookings /
                rows.filter((r) => isActiveReservation(r.status)).length) *
                1000
            ) / 10
          : 0,
    }))
    .sort((a, b) => b.bookings - a.bookings);
}

function buildDayOfWeekPremium(rows: ReservationIntelRow[]) {
  let weekdaySum = 0;
  let weekdayN = 0;
  let weekendSum = 0;
  let weekendN = 0;

  for (const r of rows) {
    if (!isActiveReservation(r.status)) continue;
    const nightly = r.nights > 0 ? Number(r.totalPrice || 0) / r.nights : 0;
    if (nightly <= 0) continue;
    const dow = new Date(`${r.checkIn}T12:00:00Z`).getUTCDay();
    if (dow === 5 || dow === 6) {
      weekendSum += nightly;
      weekendN += 1;
    } else {
      weekdaySum += nightly;
      weekdayN += 1;
    }
  }

  const weekdayAvg = weekdayN > 0 ? Math.round((weekdaySum / weekdayN) * 100) / 100 : 0;
  const weekendAvg = weekendN > 0 ? Math.round((weekendSum / weekendN) * 100) / 100 : 0;
  const premiumPct =
    weekdayAvg > 0
      ? Math.round(((weekendAvg - weekdayAvg) / weekdayAvg) * 1000) / 10
      : 0;

  return {
    weekday_avg_price: weekdayAvg,
    weekend_avg_price: weekendAvg,
    weekend_premium_pct: premiumPct,
  };
}

export interface BuildBookingIntelligenceInput {
  asOfDate: string;
  analysisFrom: string;
  analysisTo: string;
  occupancyPct: number;
  bookedNights: number;
  bookableNights: number;
  reservations: ReservationIntelRow[];
  bookingPace: BookingPaceSummary;
  currency: string;
}

export function buildBookingIntelligenceBlock(input: BuildBookingIntelligenceInput) {
  const active = input.reservations.filter((r) => isActiveReservation(r.status));
  const cancelledCount = input.reservations.filter(
    (r) => r.status === "cancelled"
  ).length;

  const confirmedGross = active.reduce((s, r) => s + Number(r.totalPrice || 0), 0);
  const totalNights = active.reduce((s, r) => s + (r.nights || 1), 0);
  const achievedAdr =
    totalNights > 0
      ? Math.round((confirmedGross / totalNights) * 100) / 100
      : 0;
  const avgLos =
    active.length > 0
      ? Math.round((totalNights / active.length) * 100) / 100
      : 0;

  const lastCheckOut = active.reduce<string | null>((max, r) => {
    if (!max || r.checkOut > max) return r.checkOut;
    return max;
  }, null);

  const daysSinceLastBooking = computeDaysSinceLastBooking(
    new Date(`${input.asOfDate}T12:00:00Z`),
    lastCheckOut
  );

  const paceRatio = input.bookingPace.primaryPaceRatio;
  const trend = resolveVelocityTrend(input.occupancyPct, paceRatio);

  const availableNights = Math.max(0, input.bookableNights - input.bookedNights);
  const potentialRevenue =
    achievedAdr > 0 ? Math.round(availableNights * achievedAdr * 100) / 100 : 0;

  return {
    analysis_period: { from: input.analysisFrom, to: input.analysisTo },
    velocity: {
      trend,
      total_booked_days: input.bookedNights,
      total_available_days: availableNights,
      occupancy_pct: input.occupancyPct,
      gross_revenue: Math.round(confirmedGross * 100) / 100,
      bookings_last_7d: countRecentBookings(input.reservations, input.asOfDate, 7),
      bookings_last_30d: countRecentBookings(input.reservations, input.asOfDate, 30),
      days_since_last_booking: daysSinceLastBooking,
      pace_vs_stly_primary: paceRatio,
      pace_windows: input.bookingPace.windows.map((w) => ({
        horizon_days: w.horizonDays,
        from_date: w.fromDate,
        to_date: w.toDate,
        booked_nights: w.bookedNights,
        stly_booked_nights: w.stlyBookedNights,
        pace_ratio: w.paceRatio,
        pickup_delta: w.pickupDelta,
      })),
    },
    length_of_stay: {
      average_nights: avgLos,
      buckets: buildLosBuckets(input.reservations),
    },
    revenue: {
      confirmed_gross: Math.round(confirmedGross * 100) / 100,
      potential_revenue: potentialRevenue,
      avg_price_per_night: achievedAdr,
      currency: input.currency,
    },
    channel_mix: buildChannelMix(input.reservations),
    lead_time_distribution: buildLeadTimeDistribution(input.reservations, input.asOfDate),
    day_of_week: buildDayOfWeekPremium(input.reservations),
    cancellations_in_window: cancelledCount,
    usage_note:
      "Pre-computed from synced reservations and calendar. Prefer these figures over re-deriving from recent_reservations.",
  };
}

export function buildMarketOverviewSnapshot(
  ctx: MarketContext,
  month?: string | null
) {
  let selectedMonth: (typeof ctx.monthlyMetrics)[number] | null = null;
  if (month && ctx.monthlyMetrics.length > 0) {
    selectedMonth = ctx.monthlyMetrics.find((m) => m.month === month) ?? null;
  }

  const occPct =
    ctx.occupancy != null ? Math.round(ctx.occupancy * 100) : null;
  const adr = ctx.p50ADR;
  const revpar =
    adr != null && ctx.occupancy != null
      ? Math.round(adr * ctx.occupancy)
      : null;

  return {
    market_id: ctx.marketId,
    bedrooms: ctx.bedrooms,
    adr,
    occupancy_pct: occPct,
    revpar,
    active_listings: ctx.activeListings,
    selected_month: selectedMonth,
    source: ctx.errors.length === 0 ? "airbtics" : "partial",
    fetched_at: ctx.fetchedAt,
    errors: ctx.errors.length > 0 ? ctx.errors : undefined,
  };
}

export function buildDemandPacingSnapshot(
  ctx: MarketContext,
  dateFrom: string,
  dateTo: string
) {
  const pacing = ctx.futurePacing
    .filter((p) => p.date >= dateFrom && p.date <= dateTo)
    .map((p) => {
      const d = parseISO(p.date);
      const occ = typeof p.occupancy === "number" ? p.occupancy : null;
      const demandScore = occ !== null ? Math.round(occ * 100) : null;
      let demandTier: "low" | "medium" | "high" | "unknown" = "unknown";
      if (demandScore !== null) {
        if (demandScore >= 75) demandTier = "high";
        else if (demandScore >= 45) demandTier = "medium";
        else demandTier = "low";
      }
      return {
        date: p.date,
        demand_score: demandScore,
        avg_price: typeof p.adr === "number" ? p.adr : null,
        market_occupancy: occ,
        demand_tier: demandTier,
        day_of_week: DOW[d.getDay()],
        is_weekend: isWeekend(d),
      };
    });

  const scored = pacing.filter((p) => p.demand_score != null);
  const avgDemandScore =
    scored.length > 0
      ? Math.round(
          scored.reduce((s, p) => s + (p.demand_score as number), 0) / scored.length
        )
      : null;

  return {
    market_id: ctx.marketId,
    p50_adr: ctx.p50ADR,
    market_occupancy_pct:
      ctx.occupancy != null ? Math.round(ctx.occupancy * 100) : null,
    avg_demand_score_in_window: avgDemandScore,
    days: pacing,
    source: ctx.errors.length === 0 ? "airbtics" : "partial",
    fetched_at: ctx.fetchedAt,
  };
}
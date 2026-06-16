import type { BookingRecencyConfig } from "./types";

/**
 * Days since the most recent completed/confirmed booking ended (null = no history).
 */
export function computeDaysSinceLastBooking(
  asOf: Date,
  lastCheckOut: string | null | undefined
): number | null {
  if (!lastCheckOut) return null;
  const end = new Date(`${lastCheckOut}T12:00:00Z`);
  const asOfUtc = new Date(`${asOf.toISOString().split("T")[0]}T12:00:00Z`);
  const diff = Math.round((asOfUtc.getTime() - end.getTime()) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? diff : 0;
}

/**
 * PriceLabs booking-recency discount: ramps from minDiscountPct to maxDiscountPct
 * as days-without-booking grows between minDaysSinceBooking and maxDaysSinceBooking.
 * Only applies to forward calendar days within forwardDays lead time.
 */
export function resolveBookingRecencyDiscountPct(
  config: BookingRecencyConfig | null | undefined,
  daysSinceLastBooking: number | null,
  leadTimeDays: number
): number | null {
  if (!config?.enabled) return null;
  if (leadTimeDays < 0 || leadTimeDays > config.forwardDays) return null;

  const daysSince = daysSinceLastBooking ?? config.maxDaysSinceBooking;
  if (daysSince < config.minDaysSinceBooking) return null;

  const span = Math.max(1, config.maxDaysSinceBooking - config.minDaysSinceBooking);
  const t = Math.min(
    1,
    Math.max(0, (daysSince - config.minDaysSinceBooking) / span)
  );
  const discount =
    config.minDiscountPct + (config.maxDiscountPct - config.minDiscountPct) * t;

  return Math.round(discount * 10) / 10;
}
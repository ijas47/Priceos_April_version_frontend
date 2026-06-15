import type { MarketPricingPack, MinStayProfile, SeasonalSegment } from "./types";
import { resolveSeasonalSegment } from "./resolve";

export function resolveWeekendDays(weekendDef: string): number[] {
  switch (weekendDef) {
    case "thu_fri":
      return [3, 4];
    case "fri_sat":
      return [4, 5];
    case "sat_sun":
      return [5, 6];
    default:
      return [4, 5];
  }
}

/** 0=Mon … 6=Sun (PriceOS convention) */
export function isWeekendDay(date: Date, weekendDays: number[]): boolean {
  const js = date.getDay();
  const dow = js === 0 ? 6 : js - 1;
  return weekendDays.includes(dow);
}

export function resolveMinStayProfile(
  pack: MarketPricingPack,
  profileId: string
): MinStayProfile | null {
  return pack.minStayProfiles.find((p) => p.id === profileId) ?? null;
}

export function resolveMinStayProfileForDate(
  pack: MarketPricingPack,
  date: Date,
  opts?: {
    seasonalCalendarId?: string;
    minStayProfileOverrideId?: string;
  }
): { segment: SeasonalSegment | null; profile: MinStayProfile | null } {
  const calendarId = opts?.seasonalCalendarId ?? pack.portfolioDefaults.defaultSeasonalCalendarId;
  const calendar = pack.seasonalCalendars.find((c) => c.id === calendarId);
  if (!calendar) return { segment: null, profile: null };

  const { segment } = resolveSeasonalSegment(pack, date, {
    seasonalCalendarId: calendarId,
  });
  if (!segment) return { segment: null, profile: null };

  const profileId = opts?.minStayProfileOverrideId ?? segment.minStayProfileId;
  const profile = resolveMinStayProfile(pack, profileId);
  return { segment, profile };
}

/** Nights until the next booked/unavailable night (1 = tomorrow is blocked). */
export function nightsUntilNextBooked(
  date: Date,
  bookingMap: Map<string, { isBooked: boolean }>,
  maxScan = 30
): number | null {
  for (let i = 1; i <= maxScan; i++) {
    const d = new Date(date);
    d.setDate(d.getDate() + i);
    const ds = d.toISOString().split("T")[0];
    if (bookingMap.get(ds)?.isBooked) return i;
  }
  return null;
}

export function computeMinStayFromProfile(
  profile: MinStayProfile,
  date: Date,
  leadTimeDays: number,
  weekendDays: number[],
  nightsBeforeBlock: number | null
): number {
  let minStay = isWeekendDay(date, weekendDays)
    ? profile.default.weekendMinStay
    : profile.default.weekdayMinStay;

  if (profile.farOut?.length) {
    const sorted = [...profile.farOut].sort(
      (a, b) => (b.beyondNights ?? 0) - (a.beyondNights ?? 0)
    );
    for (const tier of sorted) {
      if (tier.beyondNights != null && leadTimeDays >= tier.beyondNights) {
        minStay = isWeekendDay(date, weekendDays)
          ? tier.weekendMinStay
          : tier.weekdayMinStay;
        break;
      }
    }
  }

  if (profile.adjacentBeforeUnavailable?.length && nightsBeforeBlock != null) {
    const sorted = [...profile.adjacentBeforeUnavailable].sort(
      (a, b) =>
        (a.withinNightsBeforeUnavailable ?? 0) - (b.withinNightsBeforeUnavailable ?? 0)
    );
    for (const tier of sorted) {
      const within = tier.withinNightsBeforeUnavailable ?? 0;
      const start = tier.appliedWithinStart ?? 0;
      const end = tier.appliedWithinEnd ?? 999;
      if (
        nightsBeforeBlock <= within &&
        leadTimeDays >= start &&
        leadTimeDays <= end
      ) {
        minStay = isWeekendDay(date, weekendDays)
          ? tier.weekendMinStay
          : tier.weekdayMinStay;
        break;
      }
    }
  }

  return Math.max(1, minStay);
}
/**
 * Same-time-last-year (STLY) helpers for agent context and pacing comparisons.
 * Maps each date in the analysis window to the calendar position one year prior.
 */

export interface StlyInventoryRow {
  date: string;
  currentPrice?: number | null;
  status?: string | null;
}

export interface StlyReservationRow {
  checkIn: string;
  checkOut: string;
  nights: number;
  totalPrice: number;
  status?: string | null;
}

export interface StlyDay {
  date: string;
  stly_date: string;
  stly_rate: number | null;
  stly_status: string | null;
  source: "inventory" | "reservation" | "none";
}

export interface StlySummary {
  window_from: string;
  window_to: string;
  stly_window_from: string;
  stly_window_to: string;
  booked_nights: number;
  available_nights: number;
  avg_achieved_adr: number | null;
  avg_listed_rate: number | null;
  occupancy_pct: number | null;
  data_coverage_pct: number;
  days: StlyDay[];
}

const ACTIVE_RES_STATUSES = new Set([
  "confirmed",
  "pending",
  "checked_in",
  "checked_out",
]);

/** Shift an ISO date string by whole years (preserves month/day where valid). */
export function shiftIsoDate(dateStr: string, years: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().split("T")[0];
}

function enumerateDates(from: string, to: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (cur <= end) {
    out.push(cur.toISOString().split("T")[0]);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function reservationAdrOnDate(r: StlyReservationRow, date: string): number | null {
  if (!ACTIVE_RES_STATUSES.has(r.status ?? "confirmed")) return null;
  if (date < r.checkIn || date >= r.checkOut) return null;
  if (r.nights <= 0) return null;
  return r.totalPrice / r.nights;
}

function resolveStlyDay(
  stlyDate: string,
  inventoryByDate: Map<string, StlyInventoryRow>,
  reservations: StlyReservationRow[]
): Pick<StlyDay, "stly_rate" | "stly_status" | "source"> {
  const inv = inventoryByDate.get(stlyDate);
  if (inv) {
    const rate = Number(inv.currentPrice ?? 0);
    if (inv.status === "booked" && rate > 0) {
      return { stly_rate: rate, stly_status: "booked", source: "inventory" };
    }
    if (rate > 0) {
      return {
        stly_rate: rate,
        stly_status: inv.status ?? "available",
        source: "inventory",
      };
    }
  }

  for (const r of reservations) {
    const adr = reservationAdrOnDate(r, stlyDate);
    if (adr != null && adr > 0) {
      return { stly_rate: adr, stly_status: "booked", source: "reservation" };
    }
  }

  if (inv?.status) {
    return { stly_rate: null, stly_status: inv.status, source: "inventory" };
  }

  return { stly_rate: null, stly_status: null, source: "none" };
}

/**
 * Build per-day STLY map and window aggregates for an analysis range.
 */
export function buildStlySummary(
  windowFrom: string,
  windowTo: string,
  stlyInventory: StlyInventoryRow[],
  stlyReservations: StlyReservationRow[]
): StlySummary {
  const stlyFrom = shiftIsoDate(windowFrom, -1);
  const stlyTo = shiftIsoDate(windowTo, -1);
  const inventoryByDate = new Map(stlyInventory.map((r) => [r.date, r]));

  const days: StlyDay[] = enumerateDates(windowFrom, windowTo).map((date) => {
    const stlyDate = shiftIsoDate(date, -1);
    const resolved = resolveStlyDay(stlyDate, inventoryByDate, stlyReservations);
    return { date, stly_date: stlyDate, ...resolved };
  });

  const withRate = days.filter((d) => d.stly_rate != null && d.stly_rate > 0);
  const booked = days.filter((d) => d.stly_status === "booked");
  const listed = withRate.map((d) => d.stly_rate as number);
  const achieved = booked
    .map((d) => d.stly_rate)
    .filter((r): r is number => r != null && r > 0);

  const avg = (vals: number[]) =>
    vals.length > 0 ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100 : null;

  const bookable = days.filter((d) => d.stly_status !== "blocked");
  const occupancy =
    bookable.length > 0 ? Math.round((booked.length / bookable.length) * 100) : null;

  return {
    window_from: windowFrom,
    window_to: windowTo,
    stly_window_from: stlyFrom,
    stly_window_to: stlyTo,
    booked_nights: booked.length,
    available_nights: days.filter((d) => d.stly_status === "available").length,
    avg_achieved_adr: avg(achieved),
    avg_listed_rate: avg(listed),
    occupancy_pct: occupancy,
    data_coverage_pct:
      days.length > 0 ? Math.round((withRate.length / days.length) * 100) : 0,
    days,
  };
}

/** Compact per-day STLY for agent payloads (omit days with no STLY signal). */
export function compactStlyDays(summary: StlySummary): StlyDay[] {
  return summary.days.filter((d) => d.stly_rate != null || d.stly_status === "booked");
}
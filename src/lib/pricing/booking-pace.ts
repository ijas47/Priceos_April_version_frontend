import { shiftIsoDate } from "./stly";

export interface PaceInventoryRow {
  date: string;
  status?: string | null;
}

export interface PaceReservationRow {
  checkIn: string;
  checkOut: string;
  status?: string | null;
}

export interface PaceWindowMetrics {
  horizonDays: number;
  fromDate: string;
  toDate: string;
  bookedNights: number;
  stlyBookedNights: number;
  /** Current booked / STLY booked (null when STLY has no baseline). */
  paceRatio: number | null;
  pickupDelta: number;
}

export interface BookingPaceSummary {
  windows: PaceWindowMetrics[];
  /** Primary signal: 60-day horizon pace. */
  primaryPaceRatio: number | null;
}

const ACTIVE_RES = new Set([
  "confirmed",
  "pending",
  "checked_in",
  "checked_out",
]);

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

function addDaysIso(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

function isBookedOnDate(
  date: string,
  inventoryByDate: Map<string, PaceInventoryRow>,
  reservations: PaceReservationRow[]
): boolean {
  const inv = inventoryByDate.get(date);
  if (inv?.status && inv.status !== "available") return true;

  for (const r of reservations) {
    if (!ACTIVE_RES.has(r.status ?? "confirmed")) continue;
    if (date >= r.checkIn && date < r.checkOut) return true;
  }
  return false;
}

function countBookedNights(
  from: string,
  to: string,
  inventory: PaceInventoryRow[],
  reservations: PaceReservationRow[]
): number {
  const inventoryByDate = new Map(inventory.map((r) => [r.date, r]));
  let count = 0;
  for (const date of enumerateDates(from, to)) {
    if (isBookedOnDate(date, inventoryByDate, reservations)) count++;
  }
  return count;
}

export interface ComputeBookingPaceInput {
  today: string;
  forwardInventory: PaceInventoryRow[];
  forwardReservations: PaceReservationRow[];
  stlyInventory: PaceInventoryRow[];
  stlyReservations: PaceReservationRow[];
  horizons?: number[];
}

/**
 * Compare nights-on-books in forward windows vs same window last year (STLY).
 */
export function computeBookingPace(input: ComputeBookingPaceInput): BookingPaceSummary {
  const horizons = input.horizons ?? [30, 60, 90];
  const windows: PaceWindowMetrics[] = [];

  for (const horizonDays of horizons) {
    const fromDate = input.today;
    const toDate = addDaysIso(input.today, horizonDays - 1);
    const stlyFrom = shiftIsoDate(fromDate, -1);
    const stlyTo = shiftIsoDate(toDate, -1);

    const bookedNights = countBookedNights(
      fromDate,
      toDate,
      input.forwardInventory,
      input.forwardReservations
    );
    const stlyBookedNights = countBookedNights(
      stlyFrom,
      stlyTo,
      input.stlyInventory,
      input.stlyReservations
    );

    const paceRatio =
      stlyBookedNights > 0
        ? Math.round((bookedNights / stlyBookedNights) * 1000) / 1000
        : null;

    windows.push({
      horizonDays,
      fromDate,
      toDate,
      bookedNights,
      stlyBookedNights,
      paceRatio,
      pickupDelta: bookedNights - stlyBookedNights,
    });
  }

  const primary = windows.find((w) => w.horizonDays === 60) ?? windows[0];

  return {
    windows,
    primaryPaceRatio: primary?.paceRatio ?? null,
  };
}

/** Pick pace window bucket by forward lead time (days out). */
export function paceWindowForLeadTime(leadTimeDays: number): number {
  if (leadTimeDays <= 30) return 30;
  if (leadTimeDays <= 60) return 60;
  return 90;
}

/**
 * Demand multiplier from booking pace vs STLY.
 * Behind pace → soft discount; ahead → modest premium.
 */
export function resolvePaceDemandMultiplier(
  paceRatio: number | null
): { multiplier: number; note: string | null } {
  if (paceRatio == null || !Number.isFinite(paceRatio)) {
    return { multiplier: 1, note: null };
  }

  if (paceRatio < 0.75) {
    return {
      multiplier: 0.9,
      note: `[PACE] ${(paceRatio * 100).toFixed(0)}% of STLY pickup — strong discount`,
    };
  }
  if (paceRatio < 0.85) {
    return {
      multiplier: 0.94,
      note: `[PACE] ${(paceRatio * 100).toFixed(0)}% of STLY pickup — behind pace`,
    };
  }
  if (paceRatio < 0.95) {
    return {
      multiplier: 0.97,
      note: `[PACE] ${(paceRatio * 100).toFixed(0)}% of STLY pickup — slightly behind`,
    };
  }
  if (paceRatio > 1.25) {
    return {
      multiplier: 1.08,
      note: `[PACE] ${(paceRatio * 100).toFixed(0)}% of STLY pickup — strong demand`,
    };
  }
  if (paceRatio > 1.1) {
    return {
      multiplier: 1.04,
      note: `[PACE] ${(paceRatio * 100).toFixed(0)}% of STLY pickup — ahead of pace`,
    };
  }

  return { multiplier: 1, note: null };
}

export function paceRatioForLeadTime(
  summary: BookingPaceSummary,
  leadTimeDays: number
): number | null {
  const horizon = paceWindowForLeadTime(leadTimeDays);
  return summary.windows.find((w) => w.horizonDays === horizon)?.paceRatio ?? null;
}
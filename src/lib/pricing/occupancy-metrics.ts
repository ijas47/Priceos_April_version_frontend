/** Shared occupancy math for properties list, calendar-metrics, and chat injection. */

export const OCCUPIED_INVENTORY_STATUSES = new Set(["booked", "pending"]);

export const ACTIVE_RESERVATION_STATUSES = new Set([
  "confirmed",
  "pending",
  "checked_in",
  "checked_out",
]);

export interface InventoryDayRow {
  date: string;
  status?: string | null;
  currentPrice?: number | null;
}

export interface ReservationOverlapRow {
  checkIn: string;
  checkOut: string;
  status?: string | null;
}

export interface OccupancyMetrics {
  totalDays: number;
  bookedDays: number;
  availableDays: number;
  blockedDays: number;
  bookableDays: number;
  occupancyPct: number;
}

export function isOccupiedInventoryStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return OCCUPIED_INVENTORY_STATUSES.has(status);
}

export function isBlockedInventoryStatus(status: string | null | undefined): boolean {
  return status === "blocked";
}

/** True when a calendar day should count toward booked occupancy. */
export function isDateOccupied(
  date: string,
  inventoryByDate: Map<string, InventoryDayRow>,
  reservations: ReservationOverlapRow[] = []
): boolean {
  const inv = inventoryByDate.get(date);
  if (isBlockedInventoryStatus(inv?.status)) return false;
  if (isOccupiedInventoryStatus(inv?.status)) return true;

  for (const r of reservations) {
    if (!ACTIVE_RESERVATION_STATUSES.has(r.status ?? "confirmed")) continue;
    if (date >= r.checkIn && date < r.checkOut) return true;
  }
  return false;
}

export function computeOccupancyMetrics(
  inventory: InventoryDayRow[],
  reservations: ReservationOverlapRow[] = []
): OccupancyMetrics {
  const inventoryByDate = new Map(inventory.map((r) => [r.date, r]));

  let blockedDays = 0;
  let bookedDays = 0;
  let availableDays = 0;

  for (const row of inventory) {
    if (isBlockedInventoryStatus(row.status)) {
      blockedDays++;
      continue;
    }
    if (isDateOccupied(row.date, inventoryByDate, reservations)) {
      bookedDays++;
    } else {
      availableDays++;
    }
  }

  const totalDays = inventory.length;
  const bookableDays = totalDays - blockedDays;
  const occupancyPct =
    bookableDays > 0 ? Math.round((bookedDays / bookableDays) * 100) : 0;

  return {
    totalDays,
    bookedDays,
    availableDays,
    blockedDays,
    bookableDays,
    occupancyPct,
  };
}
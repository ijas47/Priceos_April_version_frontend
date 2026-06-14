import { CalendarDay } from "@/types/hostaway";
import {
  eachDayOfInterval,
  getDay,
} from "date-fns";
import { MOCK_RESERVATIONS } from "./mock-reservations";

/**
 * Mock Calendar Data Generation
 * Generates 90 days of realistic Dubai calendar data with:
 * - Varied occupancy per property (45%–85%)
 * - Seasonal pricing (20% variation)
 * - Day-of-week premium (Thu-Fri)
 * - Owner blocks scattered throughout
 */

interface DubaiSeasonConfig {
  startMonth: number;
  endMonth: number;
  multiplier: number;
  name: string;
}

// Dubai tourism seasons
const DUBAI_SEASONS: DubaiSeasonConfig[] = [
  { startMonth: 0, endMonth: 3, multiplier: 1.2, name: "High (Winter)" }, // Jan-Apr
  { startMonth: 4, endMonth: 5, multiplier: 1.0, name: "Shoulder" }, // May-Jun
  { startMonth: 6, endMonth: 9, multiplier: 0.85, name: "Low (Summer)" }, // Jul-Oct
  { startMonth: 10, endMonth: 11, multiplier: 1.15, name: "High (Festive)" }, // Nov-Dec
];

function getSeasonMultiplier(date: Date): number {
  const month = date.getMonth();
  const season = DUBAI_SEASONS.find(
    (s) => month >= s.startMonth && month <= s.endMonth
  );
  return season?.multiplier ?? 1.0;
}

function getDayOfWeekMultiplier(date: Date): number {
  const dayOfWeek = getDay(date);
  // Thu (4) and Fri (5) are weekend - premium rates
  return dayOfWeek === 4 || dayOfWeek === 5 ? 1.15 : 1.0;
}

/**
 * Simple seeded pseudo-random number generator
 * Returns a value between 0 and 1
 */
function seededRandom(seed: number): number {
  // Use a simple hash to produce varied values
  let x = Math.sin(seed * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Property-specific occupancy rate
 * Each property gets a different base occupancy (45%–85%)
 */
function getPropertyOccupancyRate(listingId: number): number {
  // Generate a consistent occupancy rate per property
  const rates: Record<number, number> = {
    1001: 68, // Marina Heights 1BR
    1002: 72, // Downtown Residences 2BR
    1003: 55, // JBR Beach Studio
    1004: 85, // Palm Villa 3BR
    1005: 63, // Bay View 1BR
    1006: 58, // Creek Harbour Studio
    1007: 78, // DIFC Tower 2BR
    1008: 45, // JVC Family 3BR
    1009: 62, // Marina Walk Studio
    1010: 70, // Springs Villa 4BR
    1011: 75, // City Walk 1BR
    1012: 48, // Silicon Oasis 2BR
    1013: 52, // Al Barsha Heights 1BR
    1014: 82, // Bluewaters 2BR Penthouse
    1015: 67, // Arabian Ranches 5BR
  };
  return rates[listingId] ?? Math.round(50 + seededRandom(listingId) * 35);
}

export function generateMockCalendar(
  listingId: number,
  startDate: Date,
  endDate: Date,
  propertyInfo?: { price: number; priceFloor: number; priceCeiling: number }
): CalendarDay[] {
  const basePrice = propertyInfo?.price ?? 500;
  const floor = propertyInfo?.priceFloor ?? Math.round(basePrice * 0.5);
  const ceiling = propertyInfo?.priceCeiling ?? Math.round(basePrice * 2);

  const propertyReservations = MOCK_RESERVATIONS.filter(r => r.listingMapId === listingId && r.status !== 'cancelled');
  const calendar: CalendarDay[] = [];
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  days.forEach((date, index) => {
    // Use seeded random for each property+day combination
    const rand = seededRandom(listingId * 137 + index * 17 + 42);
    const randBlock = seededRandom(listingId * 271 + index * 31 + 7);

    const seasonMultiplier = getSeasonMultiplier(date);
    const dayOfWeekMultiplier = getDayOfWeekMultiplier(date);
    const randomVariation = 0.92 + rand * 0.16; // ±8% variation

    let status: "available" | "booked" | "blocked" | "reserved" = "available";
    let price = basePrice;

    const dateStr = date.toISOString().split("T")[0];

    // Check if the date is within any active reservation
    const matchingReservation = propertyReservations.find(
      r => dateStr >= r.arrivalDate && dateStr < r.departureDate
    );

    if (matchingReservation) {
      status = "reserved";
      price = matchingReservation.pricePerNight;
    } else if (randBlock > 0.97) {
      // Owner blocks: ~3% of available days
      status = "blocked";
      price = 0;
    } else {
      // Available
      status = "available";
      price = Math.round(
        basePrice * seasonMultiplier * dayOfWeekMultiplier * randomVariation
      );
    }

    // Clamp to floor/ceiling for available/reserved
    if (status !== "blocked") {
      price = Math.max(floor, Math.min(ceiling, price));
    }

    // Determine block note
    let note: string | undefined = undefined;
    if (status === "blocked") {
      const blockReasons = ["Owner stay", "Maintenance", "Deep cleaning"];
      note = blockReasons[Math.floor(seededRandom(listingId * 53 + index * 11) * blockReasons.length)];
    }

    calendar.push({
      date: date.toISOString().split("T")[0],
      status,
      price,
      minimumStay: status === "available" ? 1 : 0,
      maximumStay: status === "available" ? 30 : 0,
      note,
    });
  });

  return calendar;
}

export function generateMockCalendarForMultipleProperties(
  listings: { id: number; price: number; priceFloor: number; priceCeiling: number }[],
  startDate: Date,
  endDate: Date
): Map<number, CalendarDay[]> {
  const result = new Map<number, CalendarDay[]>();

  listings.forEach((listing) => {
    result.set(
      listing.id,
      generateMockCalendar(listing.id, startDate, endDate, {
        price: listing.price,
        priceFloor: listing.priceFloor,
        priceCeiling: listing.priceCeiling,
      })
    );
  });

  return result;
}

/**
 * Calculate occupancy rate for a property's calendar
 */
export function calculateOccupancyRate(calendar: CalendarDay[]): number {
  const bookedDays = calendar.filter((day) => day.status === "booked").length;
  const totalDays = calendar.length;
  return totalDays > 0 ? (bookedDays / totalDays) * 100 : 0;
}

/**
 * Calculate average price for available days
 */
export function calculateAveragePrice(calendar: CalendarDay[]): number {
  const availableDays = calendar.filter((day) => day.status === "available");
  if (availableDays.length === 0) return 0;

  const sum = availableDays.reduce((acc, day) => acc + day.price, 0);
  return Math.round(sum / availableDays.length);
}

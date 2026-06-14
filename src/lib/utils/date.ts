/**
 * Date Utility Functions
 * Helper functions for date calculations and Dubai seasonal analysis
 */

import { isWithinInterval, getDay } from "date-fns";

export interface Season {
  name: string;
  startMonth: number;
  endMonth: number;
  multiplier: number;
  description: string;
}

export const DUBAI_SEASONS: Season[] = [
  {
    name: "High (Winter)",
    startMonth: 0, // January
    endMonth: 3, // April
    multiplier: 1.2,
    description: "Peak tourism season - comfortable weather (20-30°C)",
  },
  {
    name: "Shoulder",
    startMonth: 4, // May
    endMonth: 5, // June
    multiplier: 1.0,
    description: "Late spring - pleasant but getting hot",
  },
  {
    name: "Low (Summer)",
    startMonth: 6, // July
    endMonth: 9, // October
    multiplier: 0.85,
    description: "Extremely hot (40-50°C) - low leisure tourism",
  },
  {
    name: "High (Festive)",
    startMonth: 10, // November
    endMonth: 11, // December
    multiplier: 1.15,
    description: "Festive season and holidays - strong demand",
  },
];

/**
 * Check if a date falls within Dubai high season
 */
export function isHighSeason(date: Date): boolean {
  const month = date.getMonth();
  const season = DUBAI_SEASONS.find(
    (s) => month >= s.startMonth && month <= s.endMonth
  );
  return season ? season.multiplier >= 1.15 : false;
}

/**
 * Get the season for a given date
 */
export function getSeason(date: Date): Season {
  const month = date.getMonth();
  const season = DUBAI_SEASONS.find(
    (s) => month >= s.startMonth && month <= s.endMonth
  );
  return (
    season || {
      name: "Unknown",
      startMonth: -1,
      endMonth: -1,
      multiplier: 1.0,
      description: "",
    }
  );
}

/**
 * Get seasonal multiplier for dynamic pricing
 */
export function getSeasonMultiplier(date: Date): number {
  const month = date.getMonth();
  const season = DUBAI_SEASONS.find(
    (s) => month >= s.startMonth && month <= s.endMonth
  );
  return season?.multiplier ?? 1.0;
}

/**
 * Check if date falls on a Thu–Fri weekend (used by some regional markets).
 */
export function isThuFriWeekend(date: Date): boolean {
  const dayOfWeek = getDay(date);
  return dayOfWeek === 4 || dayOfWeek === 5; // Thursday and Friday
}

/**
 * Get day-of-week multiplier (weekend premium 1.15x, other days 1.0x).
 */
export function getDayOfWeekMultiplier(date: Date): number {
  return isThuFriWeekend(date) ? 1.15 : 1.0;
}

/**
 * Get day name
 */
export function getDayName(date: Date): string {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return days[getDay(date)];
}

/**
 * Check if date is Ramadan (varies yearly)
 * 2026: Feb 26 - Mar 27
 */
export function isRamadan(date: Date): boolean {
  const year = date.getFullYear();
  if (year === 2026) {
    return isWithinInterval(date, {
      start: new Date(2026, 1, 26), // Feb 26
      end: new Date(2026, 2, 27), // Mar 27
    });
  }
  return false;
}

/**
 * Get Ramadan dates for a given year
 */
export function getRamadanDates(
  year: number
): { start: Date; end: Date } | null {
  // Hardcoded for known years
  const ramadanDates: Record<number, { start: Date; end: Date }> = {
    2026: {
      start: new Date(2026, 1, 26), // Feb 26
      end: new Date(2026, 2, 27), // Mar 27
    },
    2025: {
      start: new Date(2025, 1, 1), // Feb 1
      end: new Date(2025, 2, 2), // Mar 2
    },
  };

  return ramadanDates[year] || null;
}

/**
 * Calculate approximate occupancy depletion
 * How many days until property is fully booked?
 */
export function daysUntilFull(
  bookedCount: number,
  totalDays: number,
  bookingRate: "low" | "medium" | "high" | "extreme"
): number {
  const availableDays = totalDays - bookedCount;
  const dailyBookRate =
    {
      extreme: 0.5,
      high: 0.3,
      medium: 0.15,
      low: 0.05,
    }[bookingRate] || 0.05;

  return Math.ceil(availableDays / dailyBookRate);
}

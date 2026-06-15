/**
 * Deterministic public holidays — no Lyzr/Perplexity required.
 * Islamic calendar dates use getRamadanDates() where hardcoded per year.
 */

import { format } from "date-fns";
import { getRamadanDates } from "@/lib/utils/date";

export interface StaticHoliday {
  title: string;
  dateStart: string;
  dateEnd: string;
  impact: "high" | "medium" | "low";
  description: string;
  suggestedPremiumPct: number;
  source: "public_holiday_calendar";
}

/** Fixed UAE public holidays (Gregorian). */
const UAE_FIXED_HOLIDAYS: Array<{
  title: string;
  month: number;
  day: number;
  endDay?: number;
  impact: "high" | "medium" | "low";
  premium: number;
  description: string;
}> = [
  {
    title: "New Year's Day",
    month: 1,
    day: 1,
    impact: "medium",
    premium: 8,
    description: "UAE public holiday — leisure travel demand uplift.",
  },
  {
    title: "Commemoration Day",
    month: 12,
    day: 1,
    impact: "low",
    premium: 3,
    description: "UAE Commemoration Day (Martyr's Day).",
  },
  {
    title: "UAE National Day",
    month: 12,
    day: 2,
    endDay: 3,
    impact: "high",
    premium: 20,
    description: "UAE National Day long weekend — strong domestic and inbound demand.",
  },
];

function toIso(year: number, month: number, day: number): string {
  return format(new Date(year, month - 1, day), "yyyy-MM-dd");
}

function overlapsWindow(start: string, end: string, dateFrom: string, dateTo: string): boolean {
  return start <= dateTo && end >= dateFrom;
}

function holidaysForCountry(
  countryCode: string,
  year: number,
  dateFrom: string,
  dateTo: string
): StaticHoliday[] {
  const out: StaticHoliday[] = [];
  const cc = countryCode.toUpperCase();

  if (cc === "AE" || cc === "UAE") {
    for (const h of UAE_FIXED_HOLIDAYS) {
      const start = toIso(year, h.month, h.day);
      const end = toIso(year, h.month, h.endDay ?? h.day);
      if (!overlapsWindow(start, end, dateFrom, dateTo)) continue;
      out.push({
        title: h.title,
        dateStart: start,
        dateEnd: end,
        impact: h.impact,
        description: h.description,
        suggestedPremiumPct: h.premium,
        source: "public_holiday_calendar",
      });
    }

    const ramadan = getRamadanDates(year);
    if (ramadan) {
      const start = format(ramadan.start, "yyyy-MM-dd");
      const end = format(ramadan.end, "yyyy-MM-dd");
      if (overlapsWindow(start, end, dateFrom, dateTo)) {
        out.push({
          title: "Ramadan",
          dateStart: start,
          dateEnd: end,
          impact: "medium",
          description:
            "Ramadan period — demand mix shifts (fewer tourists, more domestic). Pricing should reflect pacing, not generic event premiums.",
          suggestedPremiumPct: 0,
          source: "public_holiday_calendar",
        });
      }
    }
  }

  return out;
}

/** Holidays that fall inside [dateFrom, dateTo] for the given country. */
export function getStaticHolidaysForWindow(
  countryCode: string,
  _city: string,
  dateFrom: string,
  dateTo: string
): StaticHoliday[] {
  const startYear = new Date(dateFrom + "T00:00:00").getFullYear();
  const endYear = new Date(dateTo + "T00:00:00").getFullYear();
  const seen = new Set<string>();
  const merged: StaticHoliday[] = [];

  for (let y = startYear; y <= endYear; y++) {
    for (const h of holidaysForCountry(countryCode, y, dateFrom, dateTo)) {
      const key = `${h.title}:${h.dateStart}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(h);
    }
  }

  return merged.sort((a, b) => a.dateStart.localeCompare(b.dateStart));
}
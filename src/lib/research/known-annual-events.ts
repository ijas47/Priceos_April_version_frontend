/**
 * Curated annual events for key STR markets - high-confidence calendar
 * supplement when Ticketmaster/Eventbrite coverage is thin.
 */

export interface KnownAnnualEvent {
  title: string;
  /** MM-DD start (annual) */
  monthStart: number;
  dayStart: number;
  monthEnd: number;
  dayEnd: number;
  impact: "high" | "medium" | "low";
  suggestedPremiumPct: number;
  description: string;
  cities: string[];
  countryCodes: string[];
}

const DUBAI_ANNUAL: KnownAnnualEvent[] = [
  {
    title: "Dubai Shopping Festival",
    monthStart: 1, dayStart: 1, monthEnd: 2, dayEnd: 28,
    impact: "high", suggestedPremiumPct: 18,
    description: "Major winter retail and tourism festival - strong leisure demand across Dubai.",
    cities: ["Dubai"], countryCodes: ["AE", "UAE"],
  },
  {
    title: "Dubai World Cup",
    monthStart: 3, dayStart: 28, monthEnd: 3, dayEnd: 29,
    impact: "high", suggestedPremiumPct: 22,
    description: "Global horse racing event - premium short-stay demand near Meydan.",
    cities: ["Dubai"], countryCodes: ["AE", "UAE"],
  },
  {
    title: "Art Dubai",
    monthStart: 3, dayStart: 5, monthEnd: 3, dayEnd: 8,
    impact: "medium", suggestedPremiumPct: 12,
    description: "International art fair - business and luxury traveler influx.",
    cities: ["Dubai"], countryCodes: ["AE", "UAE"],
  },
  {
    title: "GITEX Global",
    monthStart: 10, dayStart: 13, monthEnd: 10, dayEnd: 17,
    impact: "high", suggestedPremiumPct: 25,
    description: "Largest tech exhibition in MENA - massive business travel demand.",
    cities: ["Dubai"], countryCodes: ["AE", "UAE"],
  },
  {
    title: "Formula 1 Abu Dhabi Grand Prix",
    monthStart: 11, dayStart: 28, monthEnd: 11, dayEnd: 30,
    impact: "high", suggestedPremiumPct: 20,
    description: "F1 season finale - spillover demand into Dubai STR market.",
    cities: ["Dubai", "Abu Dhabi"], countryCodes: ["AE", "UAE"],
  },
  {
    title: "Dubai New Year's Eve",
    monthStart: 12, dayStart: 31, monthEnd: 1, dayEnd: 1,
    impact: "high", suggestedPremiumPct: 35,
    description: "NYE fireworks and celebrations - peak single-night demand.",
    cities: ["Dubai"], countryCodes: ["AE", "UAE"],
  },
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function overlaps(start: string, end: string, from: string, to: string): boolean {
  return start <= to && end >= from;
}

export function getKnownAnnualEvents(
  city: string,
  countryCode: string,
  dateFrom: string,
  dateTo: string
): Array<{
  title: string;
  dateStart: string;
  dateEnd: string;
  impact: "high" | "medium" | "low";
  suggestedPremiumPct: number;
  description: string;
  source: "market_template";
  confidence: number;
}> {
  const cityLower = city.toLowerCase();
  const cc = countryCode.toUpperCase();
  const startYear = parseInt(dateFrom.slice(0, 4), 10);
  const endYear = parseInt(dateTo.slice(0, 4), 10);
  const out: ReturnType<typeof getKnownAnnualEvents> = [];
  const seen = new Set<string>();

  for (let year = startYear; year <= endYear; year++) {
    for (const ev of DUBAI_ANNUAL) {
      if (!ev.countryCodes.includes(cc) && cc !== "AE") continue;
      const cityMatch = ev.cities.some(
        (c) => cityLower.includes(c.toLowerCase()) || c.toLowerCase().includes(cityLower)
      );
      if (!cityMatch) continue;

      const start = `${year}-${pad(ev.monthStart)}-${pad(ev.dayStart)}`;
      let endYearAdj = year;
      if (ev.monthEnd < ev.monthStart) endYearAdj = year + 1;
      let end = `${endYearAdj}-${pad(ev.monthEnd)}-${pad(ev.dayEnd)}`;

      if (ev.title === "Dubai New Year's Eve") {
        end = `${year + 1}-01-01`;
      }

      if (!overlaps(start, end, dateFrom, dateTo)) continue;
      const key = `${ev.title}|${start}`;
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        title: ev.title,
        dateStart: start,
        dateEnd: end,
        impact: ev.impact,
        suggestedPremiumPct: ev.suggestedPremiumPct,
        description: ev.description,
        source: "market_template",
        confidence: 88,
      });
    }
  }

  return out.sort((a, b) => a.dateStart.localeCompare(b.dateStart));
}
/**
 * Official Dubai Calendar / DET recurring events - used when DTCM API key
 * is not configured but org is DTCM-eligible (Dubai + PMS connected).
 * Source: public Visit Dubai / DET event calendar (curated, high confidence).
 */

export interface DtcmCuratedEvent {
  title: string;
  monthStart: number;
  dayStart: number;
  monthEnd: number;
  dayEnd: number;
  impact: "high" | "medium" | "low";
  suggestedPremiumPct: number;
  description: string;
  url?: string;
}

/** DET / Dubai Calendar flagship events (annual windows). */
export const DTCM_CURATED_EVENTS: DtcmCuratedEvent[] = [
  {
    title: "Dubai Shopping Festival",
    monthStart: 1, dayStart: 1, monthEnd: 2, dayEnd: 28,
    impact: "high", suggestedPremiumPct: 20,
    description: "DET flagship winter festival - peak tourism and retail demand across Dubai.",
    url: "https://www.visitdubai.com/en/festivals-and-events/dubai-shopping-festival",
  },
  {
    title: "Dubai Food Festival",
    monthStart: 2, dayStart: 15, monthEnd: 3, dayEnd: 15,
    impact: "medium", suggestedPremiumPct: 10,
    description: "City-wide culinary festival - increased dining and leisure stays.",
    url: "https://www.visitdubai.com/en/festivals-and-events/dubai-food-festival",
  },
  {
    title: "Art Dubai",
    monthStart: 3, dayStart: 5, monthEnd: 3, dayEnd: 8,
    impact: "medium", suggestedPremiumPct: 12,
    description: "International art fair at Madinat Jumeirah - luxury and business travelers.",
    url: "https://www.artdubai.ae/",
  },
  {
    title: "Dubai World Cup",
    monthStart: 3, dayStart: 28, monthEnd: 3, dayEnd: 29,
    impact: "high", suggestedPremiumPct: 22,
    description: "World-class horse racing at Meydan - premium short-stay demand.",
    url: "https://www.dubaiworldcup.com/",
  },
  {
    title: "Dubai Summer Surprises",
    monthStart: 6, dayStart: 1, monthEnd: 8, dayEnd: 31,
    impact: "medium", suggestedPremiumPct: 8,
    description: "Summer entertainment program - family tourism offsets heat-season softness.",
    url: "https://www.visitdubai.com/en/festivals-and-events/dubai-summer-surprises",
  },
  {
    title: "Dubai Fitness Challenge",
    monthStart: 10, dayStart: 20, monthEnd: 11, dayEnd: 20,
    impact: "medium", suggestedPremiumPct: 10,
    description: "30-day citywide fitness initiative - group and wellness travel.",
    url: "https://www.visitdubai.com/en/festivals-and-events/dubai-fitness-challenge",
  },
  {
    title: "GITEX Global",
    monthStart: 10, dayStart: 13, monthEnd: 10, dayEnd: 17,
    impact: "high", suggestedPremiumPct: 28,
    description: "MENA's largest tech exhibition - massive business travel at DWTC.",
    url: "https://www.gitex.com/",
  },
  {
    title: "Formula 1 Abu Dhabi Grand Prix Weekend",
    monthStart: 11, dayStart: 28, monthEnd: 11, dayEnd: 30,
    impact: "high", suggestedPremiumPct: 18,
    description: "F1 season finale - spillover STR demand across Dubai emirate.",
    url: "https://www.visitdubai.com/en/festivals-and-events/formula-1-etihad-airways-abu-dhabi-grand-prix",
  },
  {
    title: "Dubai New Year's Eve Celebrations",
    monthStart: 12, dayStart: 31, monthEnd: 1, dayEnd: 1,
    impact: "high", suggestedPremiumPct: 40,
    description: "Burj Khalifa fireworks and citywide NYE - peak single-night premiums.",
    url: "https://www.visitdubai.com/en/festivals-and-events/new-years-eve",
  },
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function overlaps(start: string, end: string, from: string, to: string): boolean {
  return start <= to && end >= from;
}

export function getDtcmCuratedEvents(
  dateFrom: string,
  dateTo: string
): Array<{
  title: string;
  dateStart: string;
  dateEnd: string;
  impact: "high" | "medium" | "low";
  suggestedPremiumPct: number;
  description: string;
  url?: string;
  source: "dtcm";
  confidence: number;
}> {
  const startYear = parseInt(dateFrom.slice(0, 4), 10);
  const endYear = parseInt(dateTo.slice(0, 4), 10);
  const out: ReturnType<typeof getDtcmCuratedEvents> = [];
  const seen = new Set<string>();

  for (let year = startYear; year <= endYear; year++) {
    for (const ev of DTCM_CURATED_EVENTS) {
      const start = `${year}-${pad(ev.monthStart)}-${pad(ev.dayStart)}`;
      let endYearAdj = year;
      if (ev.monthEnd < ev.monthStart || ev.title.includes("New Year")) {
        endYearAdj = year + (ev.title.includes("New Year") ? 1 : 0);
      }
      const end = ev.title.includes("New Year")
        ? `${year + 1}-01-01`
        : `${endYearAdj}-${pad(ev.monthEnd)}-${pad(ev.dayEnd)}`;

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
        url: ev.url,
        source: "dtcm",
        confidence: 92,
      });
    }
  }

  return out.sort((a, b) => a.dateStart.localeCompare(b.dateStart));
}
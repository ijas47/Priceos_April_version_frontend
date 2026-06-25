/**
 * Build a MarketPricingPack from MarketTemplate seasonal patterns.
 * Non-UAE markets get template-derived packs; UAE keeps hand-tuned PriceLabs export.
 */

import type { IMarketTemplate, ISeasonalPattern } from "@/lib/db/models/MarketTemplate";
import type {
  MarketPricingPack,
  PricingProfile,
  SeasonalCalendar,
  SeasonalSegment,
} from "@/lib/pricing/types";
import {
  UAE_PRICING_PROFILES,
} from "@/lib/pricing/uae-pricelabs-defaults";

type TemplateLike = Pick<
  IMarketTemplate,
  "marketCode" | "displayName" | "currency" | "seasonalPatterns" | "guardrailDefaults"
>;

type SeasonBand = "peak" | "high" | "shoulder" | "low";

function bandForPremium(pct: number): SeasonBand {
  if (pct >= 25) return "peak";
  if (pct >= 10) return "high";
  if (pct >= -5) return "shoulder";
  return "low";
}

function profileIdForBand(band: SeasonBand): string {
  switch (band) {
    case "peak":
    case "high":
      return "high_season";
    case "shoulder":
      return "shoulder_season";
    default:
      return "low_season_summer";
  }
}

function monthToMd(month: number, day: number): string {
  return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function lastDayOfMonth(month: number): number {
  // Use non-leap template year
  return new Date(2025, month, 0).getDate();
}

/** Merge consecutive months with the same season band into calendar segments. */
export function buildSeasonalSegments(patterns: ISeasonalPattern[]): SeasonalSegment[] {
  const sorted = [...patterns].sort((a, b) => a.month - b.month);
  if (sorted.length === 0) return [];

  const segments: SeasonalSegment[] = [];
  let runStart = sorted[0];
  let runBand = bandForPremium(sorted[0].ratePremiumPct);

  const flush = (endMonth: number) => {
    const startMd = monthToMd(runStart.month, 1);
    const endMd = monthToMd(endMonth, lastDayOfMonth(endMonth));
    const band = runBand;
    segments.push({
      id: `${band}_${runStart.month}_${endMonth}`,
      name: band.charAt(0).toUpperCase() + band.slice(1),
      startMd,
      endMd,
      baseAdjPct: runStart.ratePremiumPct,
      pricingProfileId: profileIdForBand(band),
      minStayProfileId: "mlos_default",
    });
  };

  for (let i = 1; i < sorted.length; i++) {
    const p = sorted[i];
    const band = bandForPremium(p.ratePremiumPct);
    if (band === runBand && p.month === sorted[i - 1].month + 1) {
      continue;
    }
    flush(sorted[i - 1].month);
    runStart = p;
    runBand = band;
  }
  flush(sorted[sorted.length - 1].month);

  return segments;
}

/** Reuse UAE profile matrices as calibrated defaults for new markets. */
function defaultPricingProfiles(): PricingProfile[] {
  return UAE_PRICING_PROFILES.map((p) => ({
    ...p,
    id: p.id,
    name: p.name,
    lastMinute: { ...p.lastMinute },
    occupancyMatrix: {
      dayRanges: p.occupancyMatrix.dayRanges.map((d) => ({ ...d })),
      rows: p.occupancyMatrix.rows.map((r) => ({
        maxOccupancyPct: r.maxOccupancyPct,
        adjustmentsPct: [...r.adjustmentsPct],
      })),
    },
  }));
}

export function composePricingPackFromTemplate(template: TemplateLike): MarketPricingPack {
  const segments = buildSeasonalSegments(template.seasonalPatterns ?? []);
  const calendarId = `${template.marketCode.toLowerCase()}_seasonal`;

  const seasonalCalendars: SeasonalCalendar[] = [
    {
      id: calendarId,
      name: `${template.displayName} Seasonal`,
      segments: segments.length > 0 ? segments : [
        {
          id: "year_round",
          name: "Year round",
          startMd: "01-01",
          endMd: "12-31",
          pricingProfileId: "shoulder_season",
          minStayProfileId: "mlos_default",
        },
      ],
    },
  ];

  const maxChange = template.guardrailDefaults?.maxSingleDayChangePct ?? 12;
  const lastMinuteMax = Math.min(40, Math.max(15, Math.round(maxChange * 2)));

  return {
    marketCode: template.marketCode,
    version: `2026-06-template-${template.marketCode.toLowerCase()}`,
    source: `MarketTemplate seasonal patterns (${template.displayName})`,
    pricingProfiles: defaultPricingProfiles(),
    minStayProfiles: [
      {
        id: "mlos_default",
        name: "Default",
        default: { weekdayMinStay: 2, weekendMinStay: 2 },
      },
      {
        id: "mlos_peak",
        name: "Peak events",
        default: { weekdayMinStay: 3, weekendMinStay: 3 },
      },
    ],
    seasonalCalendars,
    portfolioDefaults: {
      defaultSeasonalCalendarId: calendarId,
      lastMinute: {
        enabled: true,
        mode: "gradual",
        maxDiscountPct: lastMinuteMax,
        minDiscountPct: 0,
        withinDays: 60,
      },
      orphanDays: {
        enabled: true,
        maxGapNights: 2,
        discountPct: 15,
      },
      bookingRecency: {
        enabled: true,
        minDiscountPct: 5,
        maxDiscountPct: 12,
        minDaysSinceBooking: 14,
        maxDaysSinceBooking: 45,
        forwardDays: 30,
      },
      farOutPremium: {
        enabled: true,
        startDaysOut: 60,
        startPremiumPct: 0,
        endPremiumPct: 15,
        rampDays: 45,
      },
      safetyMinimumPrice: {
        enabled: true,
        adrMultiplier: 1.05,
        beyondDaysOut: 120,
      },
    },
  };
}
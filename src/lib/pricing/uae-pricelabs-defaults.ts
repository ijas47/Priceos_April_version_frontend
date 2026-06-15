/**
 * UAE default pricing pack — transcribed from PriceLabs production config (Jun 2026).
 * Applied as portfolio baseline for marketCode UAE_DXB; group and listing may override.
 */
import type { MarketPricingPack, OccupancyMatrix, PricingProfile } from "./types";

const RANGES_0_15_30_60: OccupancyMatrix["dayRanges"] = [
  { startDay: 0, endDay: 15, label: "0–15 days" },
  { startDay: 16, endDay: 30, label: "16–30 days" },
  { startDay: 31, endDay: 60, label: "31–60 days" },
];

const RANGES_0_5_15_30: OccupancyMatrix["dayRanges"] = [
  { startDay: 0, endDay: 5, label: "0–5 days" },
  { startDay: 6, endDay: 15, label: "6–15 days" },
  { startDay: 16, endDay: 30, label: "16–30 days" },
];

/** Super Aggressive Discounting — Low Season (Summer) profile */
const SUPER_AGGRESSIVE_MATRIX: OccupancyMatrix = {
  dayRanges: RANGES_0_15_30_60,
  rows: [
    { maxOccupancyPct: 10, adjustmentsPct: [-35, -25, -20] },
    { maxOccupancyPct: 20, adjustmentsPct: [-30, -25, -15] },
    { maxOccupancyPct: 30, adjustmentsPct: [-25, -20, -15] },
    { maxOccupancyPct: 40, adjustmentsPct: [-25, -15, -10] },
    { maxOccupancyPct: 50, adjustmentsPct: [-20, 0, 0] },
    { maxOccupancyPct: 60, adjustmentsPct: [-15, 0, 0] },
    { maxOccupancyPct: 70, adjustmentsPct: [-10, 0, 0] },
    { maxOccupancyPct: 80, adjustmentsPct: [-10, 0, 0] },
    { maxOccupancyPct: 100, adjustmentsPct: [0, 0, 0] },
  ],
};

/** Aggressive — Shoulder Season profile */
const AGGRESSIVE_MATRIX: OccupancyMatrix = {
  dayRanges: RANGES_0_15_30_60,
  rows: [
    { maxOccupancyPct: 10, adjustmentsPct: [-30, -20, -15] },
    { maxOccupancyPct: 20, adjustmentsPct: [-25, -20, -10] },
    { maxOccupancyPct: 30, adjustmentsPct: [-20, -15, -10] },
    { maxOccupancyPct: 40, adjustmentsPct: [-20, -10, -5] },
    { maxOccupancyPct: 50, adjustmentsPct: [-15, 0, 0] },
    { maxOccupancyPct: 60, adjustmentsPct: [-10, 0, 0] },
    { maxOccupancyPct: 70, adjustmentsPct: [-5, 0, 5] },
    { maxOccupancyPct: 80, adjustmentsPct: [-5, 5, 10] },
    { maxOccupancyPct: 100, adjustmentsPct: [0, 10, 20] },
  ],
};

/** Custom — High Season profile (discounts near-term, premiums far-out at high occupancy) */
const HIGH_SEASON_CUSTOM_MATRIX: OccupancyMatrix = {
  dayRanges: RANGES_0_5_15_30,
  rows: [
    { maxOccupancyPct: 10, adjustmentsPct: [-20, -15, -10] },
    { maxOccupancyPct: 20, adjustmentsPct: [-15, -10, -5] },
    { maxOccupancyPct: 30, adjustmentsPct: [-10, -5, -5] },
    { maxOccupancyPct: 40, adjustmentsPct: [-5, -5, 0] },
    { maxOccupancyPct: 50, adjustmentsPct: [-5, 0, 0] },
    { maxOccupancyPct: 60, adjustmentsPct: [0, 0, 0] },
    { maxOccupancyPct: 70, adjustmentsPct: [0, 0, 5] },
    { maxOccupancyPct: 80, adjustmentsPct: [0, 5, 10] },
    { maxOccupancyPct: 100, adjustmentsPct: [0, 10, 15] },
  ],
};

export const UAE_PRICING_PROFILES: PricingProfile[] = [
  {
    id: "high_season",
    name: "High Season",
    lastMinute: {
      enabled: true,
      mode: "gradual",
      maxDiscountPct: 20,
      minDiscountPct: 0,
      withinDays: 60,
    },
    occupancyPreset: "custom",
    occupancyMatrix: HIGH_SEASON_CUSTOM_MATRIX,
    demandSensitivity: "recommended",
    farOutPremium: null,
  },
  {
    id: "low_season_summer",
    name: "Low Season (Summer)",
    lastMinute: {
      enabled: true,
      mode: "gradual",
      maxDiscountPct: 30,
      minDiscountPct: 0,
      withinDays: 60,
    },
    occupancyPreset: "super_aggressive",
    occupancyMatrix: SUPER_AGGRESSIVE_MATRIX,
    demandSensitivity: "conservative",
    farOutPremium: null,
  },
  {
    id: "shoulder_season",
    name: "Shoulder Season",
    lastMinute: {
      enabled: true,
      mode: "gradual",
      maxDiscountPct: 25,
      minDiscountPct: 0,
      withinDays: 50,
    },
    occupancyPreset: "aggressive",
    occupancyMatrix: AGGRESSIVE_MATRIX,
    demandSensitivity: "recommended",
    farOutPremium: null,
  },
];

export const UAE_PRICELABS_DEFAULTS: MarketPricingPack = {
  marketCode: "UAE_DXB",
  version: "2026-06-pricelabs-v1",
  source: "PriceLabs production export (screenshots Jun 2026)",
  pricingProfiles: UAE_PRICING_PROFILES,
  minStayProfiles: [
    {
      id: "mlos_default",
      name: "Default",
      default: { weekdayMinStay: 2, weekendMinStay: 2 },
    },
    {
      id: "mlos_final",
      name: "MLOS Final",
      default: { weekdayMinStay: 2, weekendMinStay: 2 },
      farOut: [
        { beyondNights: 31, weekdayMinStay: 3, weekendMinStay: 3 },
        { beyondNights: 90, weekdayMinStay: 4, weekendMinStay: 4 },
        { beyondNights: 120, weekdayMinStay: 5, weekendMinStay: 5 },
        { beyondNights: 180, weekdayMinStay: 6, weekendMinStay: 6 },
        { beyondNights: 250, weekdayMinStay: 7, weekendMinStay: 7 },
      ],
      adjacentBeforeUnavailable: [
        { withinNightsBeforeUnavailable: 1, weekdayMinStay: 1, weekendMinStay: 1, appliedWithinStart: 0, appliedWithinEnd: 999 },
        { withinNightsBeforeUnavailable: 2, weekdayMinStay: 2, weekendMinStay: 2, appliedWithinStart: 0, appliedWithinEnd: 999 },
        { withinNightsBeforeUnavailable: 3, weekdayMinStay: 3, weekendMinStay: 3, appliedWithinStart: 0, appliedWithinEnd: 999 },
        { withinNightsBeforeUnavailable: 4, weekdayMinStay: 4, weekendMinStay: 4, appliedWithinStart: 0, appliedWithinEnd: 999 },
        { withinNightsBeforeUnavailable: 5, weekdayMinStay: 5, weekendMinStay: 5, appliedWithinStart: 0, appliedWithinEnd: 999 },
      ],
    },
    {
      id: "mlos_ny",
      name: "MLOS NY",
      default: { weekdayMinStay: 3, weekendMinStay: 3 },
      adjacentBeforeUnavailable: [
        { withinNightsBeforeUnavailable: 1, weekdayMinStay: 1, weekendMinStay: 1, appliedWithinStart: 0, appliedWithinEnd: 999 },
        { withinNightsBeforeUnavailable: 2, weekdayMinStay: 2, weekendMinStay: 2, appliedWithinStart: 0, appliedWithinEnd: 999 },
        { withinNightsBeforeUnavailable: 3, weekdayMinStay: 3, weekendMinStay: 3, appliedWithinStart: 0, appliedWithinEnd: 999 },
        { withinNightsBeforeUnavailable: 4, weekdayMinStay: 4, weekendMinStay: 4, appliedWithinStart: 0, appliedWithinEnd: 999 },
        { withinNightsBeforeUnavailable: 5, weekdayMinStay: 5, weekendMinStay: 5, appliedWithinStart: 0, appliedWithinEnd: 999 },
      ],
    },
    {
      id: "villa_settings",
      name: "Villa Settings",
      default: { weekdayMinStay: 3, weekendMinStay: 3 },
    },
  ],
  seasonalCalendars: [
    {
      id: "uae_account_seasonal",
      name: "UAE Account Custom Seasonal",
      segments: [
        { id: "ny", name: "NY", startMd: "01-01", endMd: "01-01", minAdjPct: 1, baseAdjPct: 1, maxAdjPct: 1, pricingProfileId: "high_season", minStayProfileId: "mlos_ny" },
        { id: "high_winter", name: "High", startMd: "01-02", endMd: "03-12", pricingProfileId: "high_season", minStayProfileId: "mlos_final" },
        { id: "shoulder_spring", name: "Shoulder", startMd: "03-13", endMd: "06-09", minAdjPct: -10, baseAdjPct: -15, pricingProfileId: "low_season_summer", minStayProfileId: "mlos_final" },
        { id: "summer", name: "Summer", startMd: "06-10", endMd: "09-12", minAdjPct: -5, pricingProfileId: "low_season_summer", minStayProfileId: "mlos_final" },
        { id: "shoulder_fall", name: "Shoulder", startMd: "09-20", endMd: "10-05", pricingProfileId: "high_season", minStayProfileId: "mlos_final" },
        { id: "high_fall", name: "High", startMd: "10-06", endMd: "12-05", pricingProfileId: "high_season", minStayProfileId: "mlos_final" },
        { id: "shoulder_holiday", name: "Shoulder/Low", startMd: "12-06", endMd: "12-25", pricingProfileId: "low_season_summer", minStayProfileId: "mlos_final" },
      ],
    },
  ],
  portfolioDefaults: {
    defaultSeasonalCalendarId: "uae_account_seasonal",
    lastMinute: {
      enabled: true,
      mode: "market_balanced",
      maxDiscountPct: 40,
      minDiscountPct: 0,
      withinDays: 7,
    },
    orphanDays: {
      enabled: true,
      maxGapNights: 2,
      discountPct: 20,
    },
    bookingRecency: {
      enabled: true,
      minDiscountPct: 5,
      maxDiscountPct: 15,
      minDaysSinceBooking: 15,
      maxDaysSinceBooking: 45,
      forwardDays: 30,
    },
    farOutPremium: {
      enabled: true,
      startDaysOut: 60,
      startPremiumPct: 0,
      endPremiumPct: 20,
      rampDays: 41,
    },
    safetyMinimumPrice: {
      enabled: true,
      adrMultiplier: 1.1,
      beyondDaysOut: 180,
    },
  },
};

/** Resolve a pricing profile for a calendar date using the UAE seasonal calendar. */
export function resolveUaePricingProfileForDate(
  date: Date,
  pack: MarketPricingPack = UAE_PRICELABS_DEFAULTS
): PricingProfile | null {
  const md = `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const calendar = pack.seasonalCalendars.find((c) => c.id === pack.portfolioDefaults.defaultSeasonalCalendarId);
  if (!calendar) return null;

  const segment = calendar.segments.find((s) => {
    if (s.startMd <= s.endMd) return md >= s.startMd && md <= s.endMd;
    return md >= s.startMd || md <= s.endMd;
  });
  if (!segment) return null;

  return pack.pricingProfiles.find((p) => p.id === segment.pricingProfileId) ?? null;
}
/**
 * PriceLabs-parity pricing configuration types.
 * Scoped at portfolio (org), group, or listing - resolved listing > group > portfolio.
 */

export type PricingScope = "portfolio" | "group" | "listing";

export type OccupancyPresetId =
  | "custom"
  | "aggressive"
  | "super_aggressive"
  | "recommended";

export type DemandSensitivity = "recommended" | "conservative" | "aggressive";

export type LastMinuteMode = "gradual" | "fixed" | "market_balanced";

/** One column in the occupancy × lead-time matrix (e.g. 0–15 days). */
export interface DayRange {
  startDay: number;
  endDay: number;
  label?: string;
}

/** Row in occupancy matrix: at or below maxOccupancyPct, apply adjustments per day range. */
export interface OccupancyMatrixRow {
  maxOccupancyPct: number;
  /** Adjustment % per day range column (negative = discount). */
  adjustmentsPct: number[];
}

export interface OccupancyMatrix {
  dayRanges: DayRange[];
  rows: OccupancyMatrixRow[];
}

export interface LastMinuteConfig {
  enabled: boolean;
  mode: LastMinuteMode;
  /** Max discount at day 0 (same-day / nearest). */
  maxDiscountPct: number;
  /** Discount at end of ramp window (often 0). */
  minDiscountPct: number;
  /** Days until discount reaches minDiscountPct. */
  withinDays: number;
}

export interface FarOutPremiumConfig {
  enabled: boolean;
  /** Days out when premium starts. */
  startDaysOut: number;
  /** Premium at start of ramp. */
  startPremiumPct: number;
  /** Premium at end of ramp. */
  endPremiumPct: number;
  /** Days over which premium ramps from start → end. */
  rampDays: number;
}

export interface OrphanDayConfig {
  enabled: boolean;
  /** Discount for gaps of this many nights or fewer. */
  maxGapNights: number;
  discountPct: number;
}

export interface BookingRecencyConfig {
  enabled: boolean;
  minDiscountPct: number;
  maxDiscountPct: number;
  /** Days since last booking for min discount. */
  minDaysSinceBooking: number;
  /** Days since last booking for max discount. */
  maxDaysSinceBooking: number;
  /** How many forward days the recency factor affects. */
  forwardDays: number;
}

export interface SafetyMinimumPriceConfig {
  enabled: boolean;
  /** Multiplier on last-year-same-day ADR. */
  adrMultiplier: number;
  /** Only applies to dates beyond this many days from today. */
  beyondDaysOut: number;
}

/** Reusable pricing profile (PriceLabs "Pricing Profile"). */
export interface PricingProfile {
  id: string;
  name: string;
  lastMinute: LastMinuteConfig;
  occupancyPreset: OccupancyPresetId;
  occupancyMatrix: OccupancyMatrix;
  demandSensitivity: DemandSensitivity;
  farOutPremium: FarOutPremiumConfig | null;
}

export interface MinStayTier {
  beyondNights?: number;
  withinNightsBeforeUnavailable?: number;
  weekdayMinStay: number;
  weekendMinStay: number;
  appliedWithinStart?: number;
  appliedWithinEnd?: number;
}

/** Reusable min-stay profile (PriceLabs "Minstay Profile"). */
export interface MinStayProfile {
  id: string;
  name: string;
  default: { weekdayMinStay: number; weekendMinStay: number };
  farOut?: MinStayTier[];
  adjacentBeforeUnavailable?: MinStayTier[];
}

/** One segment in the annual seasonal calendar. */
export interface SeasonalSegment {
  id: string;
  name: string;
  /** MM-DD, repeats yearly */
  startMd: string;
  endMd: string;
  minAdjPct?: number;
  baseAdjPct?: number;
  maxAdjPct?: number;
  pricingProfileId: string;
  minStayProfileId: string;
  checkInOutProfileId?: string;
}

/** Portfolio-level defaults (PriceLabs "Account Level"). */
export interface PortfolioPricingDefaults {
  lastMinute: LastMinuteConfig;
  orphanDays: OrphanDayConfig;
  bookingRecency: BookingRecencyConfig;
  farOutPremium: FarOutPremiumConfig;
  safetyMinimumPrice: SafetyMinimumPriceConfig;
  /** When listing has no custom seasonal calendar, use this profile id. */
  defaultSeasonalCalendarId: string;
}

export interface SeasonalCalendar {
  id: string;
  name: string;
  segments: SeasonalSegment[];
}

export interface MarketPricingPack {
  marketCode: string;
  version: string;
  source: string;
  pricingProfiles: PricingProfile[];
  minStayProfiles: MinStayProfile[];
  seasonalCalendars: SeasonalCalendar[];
  portfolioDefaults: PortfolioPricingDefaults;
}
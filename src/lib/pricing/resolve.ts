import mongoose from "mongoose";
import {
  connectDB,
  Organization,
  PropertyGroup,
  GroupPricingRule,
  PricingRule,
  InventoryMaster,
} from "@/lib/db";
import type { MarketPricingPack, PricingProfile, SeasonalSegment } from "./types";
import { UAE_PRICELABS_DEFAULTS } from "./uae-pricelabs-defaults";
import type { ListingConfig, Rule } from "@/lib/engine/waterfall";
import { usesMonthFirstAnchor } from "@/lib/pricing/anchor-weights";
import type { MarketSignal } from "@/lib/engine/waterfall";

function mdFromDate(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function segmentMatchesDate(segment: SeasonalSegment, date: Date): boolean {
  const md = mdFromDate(date);
  if (segment.startMd <= segment.endMd) {
    return md >= segment.startMd && md <= segment.endMd;
  }
  return md >= segment.startMd || md <= segment.endMd;
}

export function getOrgPricingPack(org: { pricingPack?: unknown; marketCode?: string }): MarketPricingPack {
  if (org.pricingPack && typeof org.pricingPack === "object") {
    return org.pricingPack as MarketPricingPack;
  }
  if (org.marketCode === "UAE_DXB" || !org.marketCode) {
    return UAE_PRICELABS_DEFAULTS;
  }
  return UAE_PRICELABS_DEFAULTS;
}

export function resolveSeasonalSegment(
  pack: MarketPricingPack,
  date: Date,
  opts?: { seasonalCalendarId?: string; pricingProfileOverrideId?: string }
): { segment: SeasonalSegment | null; profile: PricingProfile | null } {
  const calendarId = opts?.seasonalCalendarId ?? pack.portfolioDefaults.defaultSeasonalCalendarId;
  const calendar = pack.seasonalCalendars.find((c) => c.id === calendarId);
  if (!calendar) return { segment: null, profile: null };

  const segment = calendar.segments.find((s) => segmentMatchesDate(s, date)) ?? null;
  if (!segment) return { segment: null, profile: null };

  const profileId = opts?.pricingProfileOverrideId ?? segment.pricingProfileId;
  const profile = pack.pricingProfiles.find((p) => p.id === profileId) ?? null;
  return { segment, profile };
}

/** Rolling occupancy % for a listing over lookback window. */
export async function computeListingOccupancyPct(
  listingId: mongoose.Types.ObjectId,
  lookbackDays: number,
  asOf: Date
): Promise<number> {
  const since = new Date(asOf);
  since.setDate(since.getDate() - lookbackDays);
  const sinceStr = since.toISOString().split("T")[0];
  const asOfStr = asOf.toISOString().split("T")[0];

  const days = await InventoryMaster.find({
    listingId,
    date: { $gte: sinceStr, $lt: asOfStr },
  })
    .select("status")
    .lean();

  if (days.length === 0) return 50;
  const booked = days.filter((d) => d.status !== "available").length;
  return Math.round((booked / days.length) * 100);
}

/** Lookup occupancy matrix adjustment for occupancy % and lead time. */
export function lookupOccupancyAdjustment(
  matrix: PricingProfile["occupancyMatrix"] | undefined,
  occupancyPct: number,
  leadTimeDays: number
): number | null {
  if (!matrix?.rows?.length || !matrix.dayRanges?.length) return null;

  let colIdx = -1;
  for (let i = 0; i < matrix.dayRanges.length; i++) {
    const r = matrix.dayRanges[i];
    if (leadTimeDays >= r.startDay && leadTimeDays <= r.endDay) {
      colIdx = i;
      break;
    }
  }
  if (colIdx < 0) return null;

  const sorted = [...matrix.rows].sort((a, b) => a.maxOccupancyPct - b.maxOccupancyPct);
  for (const row of sorted) {
    if (occupancyPct <= row.maxOccupancyPct) {
      return row.adjustmentsPct[colIdx] ?? 0;
    }
  }
  return sorted[sorted.length - 1]?.adjustmentsPct[colIdx] ?? 0;
}

export interface ResolvedPricingContext {
  pack: MarketPricingPack;
  groups: { _id: mongoose.Types.ObjectId; name: string }[];
  groupRules: Rule[];
  listingRules: Rule[];
  occupancyPct: number;
}

export async function loadPricingContext(
  listingId: mongoose.Types.ObjectId | string,
  orgId: mongoose.Types.ObjectId | string,
  asOf: Date = new Date()
): Promise<ResolvedPricingContext> {
  await connectDB();
  const lid = typeof listingId === "string" ? new mongoose.Types.ObjectId(listingId) : listingId;
  const oid = typeof orgId === "string" ? new mongoose.Types.ObjectId(orgId) : orgId;

  const org = await Organization.findById(oid).lean();
  const pack = getOrgPricingPack(org ?? {});

  const groups = await PropertyGroup.find({ orgId: oid, listingIds: lid }).lean();
  const groupIds = groups.map((g) => g._id);

  const [groupRuleRows, listingRuleRows] = await Promise.all([
    groupIds.length
      ? GroupPricingRule.find({ groupId: { $in: groupIds }, enabled: true }).sort({ priority: 1 }).lean()
      : [],
    PricingRule.find({ listingId: lid, enabled: true }).sort({ priority: 1 }).lean(),
  ]);

  const toRule = (r: {
    _id: mongoose.Types.ObjectId;
    ruleType: string;
    name: string;
    enabled: boolean;
    priority: number;
    startDate?: string;
    endDate?: string;
    daysOfWeek?: number[];
    minNights?: number | null;
    priceOverride?: number | null;
    priceAdjPct?: number | null;
    minPriceOverride?: number | null;
    maxPriceOverride?: number | null;
    minStayOverride?: number | null;
    isBlocked?: boolean;
    closedToArrival?: boolean;
    closedToDeparture?: boolean;
    suspendLastMinute?: boolean;
    suspendGapFill?: boolean;
  }, scopeBoost: number): Rule => ({
    id: r._id.toString(),
    ruleType: r.ruleType as Rule["ruleType"],
    name: r.name,
    enabled: r.enabled,
    priority: r.priority + scopeBoost,
    startDate: r.startDate ?? null,
    endDate: r.endDate ?? null,
    daysOfWeek: r.daysOfWeek ?? null,
    minNights: r.minNights ?? null,
    priceOverride: r.priceOverride ?? null,
    priceAdjPct: r.priceAdjPct ?? null,
    minPriceOverride: r.minPriceOverride ?? null,
    maxPriceOverride: r.maxPriceOverride ?? null,
    minStayOverride: r.minStayOverride ?? null,
    isBlocked: r.isBlocked ?? false,
    closedToArrival: r.closedToArrival ?? false,
    closedToDeparture: r.closedToDeparture ?? false,
    suspendLastMinute: r.suspendLastMinute ?? false,
    suspendGapFill: r.suspendGapFill ?? false,
  });

  const groupRules = groupRuleRows.map((r) => toRule(r, 50));
  const listingRules = listingRuleRows.map((r) => toRule(r, 100));

  const listing = await (await import("@/lib/db")).Listing.findById(lid).lean();
  const lookback = listing?.occupancyLookbackDays ?? 30;
  const occupancyPct = await computeListingOccupancyPct(lid, lookback, asOf);

  return {
    pack,
    groups: groups.map((g) => ({ _id: g._id, name: g.name })),
    groupRules,
    listingRules,
    occupancyPct,
  };
}

/** Merge portfolio profile + listing overrides into engine config for a specific day. */
export function applyProfileToConfig(
  base: ListingConfig,
  listing: {
    usePortfolioPricingDefaults?: boolean;
    pricingProfileOverrideId?: string;
    seasonalCalendarOverrideId?: string;
    occupancyEnabled?: boolean;
    occupancyMatrix?: PricingProfile["occupancyMatrix"];
    occupancyPreset?: string;
    lastMinuteRampEnabled?: boolean;
    lastMinuteRampDays?: number;
    lastMinuteMaxDiscountPct?: number;
    lastMinuteMinDiscountPct?: number;
    lastMinuteEnabled?: boolean;
    lastMinuteDaysOut?: number;
    lastMinuteDiscountPct?: number;
  },
  pack: MarketPricingPack,
  date: Date,
  groupOverrides?: { seasonalCalendarOverrideId?: string; pricingProfileOverrideId?: string },
  marketSignal?: MarketSignal
): ListingConfig {
  const usePortfolio = listing.usePortfolioPricingDefaults !== false;
  if (!usePortfolio) return base;

  const calendarId =
    listing.seasonalCalendarOverrideId ??
    groupOverrides?.seasonalCalendarOverrideId ??
    pack.portfolioDefaults.defaultSeasonalCalendarId;

  const profileOverride =
    listing.pricingProfileOverrideId ?? groupOverrides?.pricingProfileOverrideId;

  const { segment, profile } = resolveSeasonalSegment(pack, date, {
    seasonalCalendarId: calendarId,
    pricingProfileOverrideId: profileOverride,
  });

  const out = { ...base };

  if (profile?.lastMinute?.enabled) {
    out.lastMinuteEnabled = true;
    out.lastMinuteDaysOut = profile.lastMinute.withinDays;
    out.lastMinuteDiscountPct = profile.lastMinute.maxDiscountPct;
    out.lastMinuteRampEnabled = profile.lastMinute.mode === "gradual";
    out.lastMinuteRampDays = profile.lastMinute.withinDays;
    out.lastMinuteMaxDiscountPct = profile.lastMinute.maxDiscountPct;
    out.lastMinuteMinDiscountPct = profile.lastMinute.minDiscountPct;
  }

  const portfolioLm = pack.portfolioDefaults.lastMinute;
  if (portfolioLm.enabled && !profile?.lastMinute?.enabled) {
    out.lastMinuteEnabled = true;
    out.lastMinuteDaysOut = portfolioLm.withinDays;
    out.lastMinuteDiscountPct = portfolioLm.maxDiscountPct;
    out.lastMinuteRampEnabled = portfolioLm.mode === "gradual" || portfolioLm.mode === "market_balanced";
    out.lastMinuteRampDays = portfolioLm.withinDays;
    out.lastMinuteMaxDiscountPct = portfolioLm.maxDiscountPct;
    out.lastMinuteMinDiscountPct = portfolioLm.minDiscountPct;
  }

  // Seasonal calendar switches tactical profiles only when month-first market
  // anchor is active — avoid stacking small % rules on top of monthly ADR.
  const skipSeasonalPct = usesMonthFirstAnchor(marketSignal);
  if (!skipSeasonalPct && segment?.baseAdjPct != null) {
    out.basePrice = out.basePrice * (1 + segment.baseAdjPct / 100);
  }

  const farOut = pack.portfolioDefaults.farOutPremium;
  if (farOut?.enabled) {
    out.farOutEnabled = true;
    out.farOutDaysOut = farOut.startDaysOut;
    out.farOutMarkupPct = farOut.endPremiumPct;
  }

  if (listing.usePortfolioPricingDefaults === false && listing.occupancyMatrix) {
    out.occupancyEnabled = listing.occupancyEnabled ?? true;
    out.occupancyMatrix = listing.occupancyMatrix as ListingConfig["occupancyMatrix"];
  } else if (listing.occupancyEnabled !== false && profile?.occupancyMatrix) {
    out.occupancyEnabled = true;
    out.occupancyMatrix = profile.occupancyMatrix;
  } else if (listing.occupancyMatrix) {
    out.occupancyEnabled = listing.occupancyEnabled ?? true;
    out.occupancyMatrix = listing.occupancyMatrix as ListingConfig["occupancyMatrix"];
  }

  if (listing.lastMinuteRampEnabled !== undefined) {
    out.lastMinuteRampEnabled = listing.lastMinuteRampEnabled;
    out.lastMinuteRampDays = listing.lastMinuteRampDays ?? out.lastMinuteRampDays;
    out.lastMinuteMaxDiscountPct = listing.lastMinuteMaxDiscountPct ?? out.lastMinuteMaxDiscountPct;
    out.lastMinuteMinDiscountPct = listing.lastMinuteMinDiscountPct ?? out.lastMinuteMinDiscountPct;
  }

  return out;
}

export function mergeRules(ctx: ResolvedPricingContext): Rule[] {
  return [...ctx.groupRules, ...ctx.listingRules];
}

export interface PricingRulesWindowSummary {
  pack_version: string;
  pack_source: string;
  market_code: string;
  segments_active_in_window: Array<{
    segment_id: string;
    segment_name: string;
    profile_name: string | null;
    base_adj_pct: number | null;
    occupancy_preset: string | null;
  }>;
  portfolio_defaults: {
    last_minute_within_days: number;
    far_out_premium_pct: number | null;
    orphan_discount_pct: number | null;
  };
  role: string;
}

/** Summarize which UAE / portfolio pricing pack segments apply in the analysis window. */
export function summarizeActivePricingRules(
  pack: MarketPricingPack,
  windowFrom: string,
  windowTo: string
): PricingRulesWindowSummary {
  const segments: PricingRulesWindowSummary["segments_active_in_window"] = [];
  const seen = new Set<string>();

  const cur = new Date(`${windowFrom}T12:00:00Z`);
  const end = new Date(`${windowTo}T12:00:00Z`);
  while (cur <= end) {
    const dateStr = cur.toISOString().split("T")[0];
    const { segment, profile } = resolveSeasonalSegment(pack, cur);
    if (segment && !seen.has(segment.id)) {
      seen.add(segment.id);
      segments.push({
        segment_id: segment.id,
        segment_name: segment.name,
        profile_name: profile?.name ?? null,
        base_adj_pct: segment.baseAdjPct ?? null,
        occupancy_preset: profile?.occupancyPreset ?? null,
      });
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  const lm = pack.portfolioDefaults.lastMinute;
  const farOut = pack.portfolioDefaults.farOutPremium;
  const orphan = pack.portfolioDefaults.orphanDays;

  return {
    pack_version: pack.version,
    pack_source: pack.source,
    market_code: pack.marketCode,
    segments_active_in_window: segments,
    portfolio_defaults: {
      last_minute_within_days: lm.withinDays,
      far_out_premium_pct: farOut?.enabled ? farOut.endPremiumPct : null,
      orphan_discount_pct: orphan?.enabled ? orphan.discountPct : null,
    },
    role: "Operational rulebook (~20% weight): occupancy matrix, last-minute ramp, seasonal baseAdj, gap fill - applied in engine Pass 1–3 after market anchor.",
  };
}
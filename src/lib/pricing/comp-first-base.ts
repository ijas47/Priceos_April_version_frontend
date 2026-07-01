import { p50CeilingForBedrooms } from "@/lib/pricing/benchmark-sanity";
import { resolveBedroomsNumber } from "@/lib/pricing/bedrooms";
import type { CompSetPercentiles } from "@/lib/pricing/market-anchor";

/** Minimum similar listings required to trust a regional comp set. */
export const MIN_COMP_SET_SIZE = 3;

/** Sources backed by individual listing rates in the same region / bedroom class. */
export const LISTING_LEVEL_COMP_SOURCES = new Set<CompSetPercentiles["source"]>([
  "dubai_airroi_comps",
  "airbtics_comps",
  "benchmark_comps",
]);

export interface CompAnchoredBaseInput {
  compPercentiles: CompSetPercentiles;
  calendarPrices: number[];
  achievedAdr?: number | null;
  achievedBookingCount?: number;
  bedrooms?: number | null;
  area?: string | null;
  /** Cached benchmark row p50 when comp set is summary-only. */
  benchmarkP50?: number | null;
}

export interface CompAnchoredBaseResult {
  mode: "comp_set" | "achieved_adr" | "calendar" | "calendar_corrected";
  trustedBase: number;
  compP50: number | null;
  compCount: number;
  compSource: CompSetPercentiles["source"] | null;
  calendarMedian: number;
  calendarTrusted: boolean;
  pmsPriceTrusted: boolean;
  compFirst: boolean;
  reason: string | null;
  flags: string[];
}

function medianPositive(prices: number[]): number {
  const positive = prices.filter((p) => p > 0).sort((a, b) => a - b);
  if (positive.length === 0) return 0;
  return positive[Math.floor(positive.length / 2)];
}

export function isListingLevelCompSet(comp: CompSetPercentiles): boolean {
  return (
    comp.p50 != null &&
    comp.p50 > 0 &&
    comp.count >= MIN_COMP_SET_SIZE &&
    LISTING_LEVEL_COMP_SOURCES.has(comp.source)
  );
}

function calendarDeviationFromAnchor(calendarMedian: number, anchor: number): number | null {
  if (calendarMedian <= 0 || anchor <= 0) return null;
  return Math.abs(calendarMedian - anchor) / anchor;
}

function formatUnitLabel(bedrooms: number): string {
  return bedrooms === 0 ? "studio" : `${bedrooms}BR`;
}

/**
 * Production comp-first base: when we have enough similar units in the region,
 * their median clearing rate (p50) is the authoritative anchor — not Hostaway calendar.
 */
export function resolveCompAnchoredBase(input: CompAnchoredBaseInput): CompAnchoredBaseResult {
  const calendarMedian = medianPositive(input.calendarPrices);
  const flags: string[] = [];
  const bedrooms = resolveBedroomsNumber(input.bedrooms, 1);
  const areaLabel = input.area?.trim() || "this area";
  const unitLabel = formatUnitLabel(bedrooms);

  const comp = input.compPercentiles;
  const compP50 = comp.p50 ?? null;
  const compCount = comp.count;
  const compSource = comp.source;
  const strongCompSet = isListingLevelCompSet(comp);

  const achievedCount = input.achievedBookingCount ?? 0;
  const achieved =
    input.achievedAdr && input.achievedAdr > 0 ? Math.round(input.achievedAdr) : null;

  if (achieved && achievedCount >= 5) {
    const devFromComp =
      compP50 && compP50 > 0 ? calendarDeviationFromAnchor(calendarMedian, compP50) : null;
    const devFromAchieved = calendarDeviationFromAnchor(calendarMedian, achieved);
    const calendarTrusted =
      calendarMedian > 0 &&
      (devFromComp == null || devFromComp <= 0.25) &&
      (devFromAchieved == null || devFromAchieved <= 0.35);

    return {
      mode: "achieved_adr",
      trustedBase: achieved,
      compP50,
      compCount,
      compSource,
      calendarMedian,
      calendarTrusted,
      pmsPriceTrusted: calendarTrusted,
      compFirst: strongCompSet,
      reason: strongCompSet
        ? `Achieved ADR ${achieved} from ${achievedCount} bookings; ${compCount} ${unitLabel} comps in ${areaLabel} at p50 ${compP50}.`
        : `Achieved ADR ${achieved} from ${achievedCount} bookings.`,
      flags: strongCompSet ? ["achieved_adr", "comp_set_available"] : ["achieved_adr"],
    };
  }

  if (strongCompSet && compP50) {
    const deviation = calendarDeviationFromAnchor(calendarMedian, compP50);
    const calendarTrusted = deviation != null && deviation <= 0.25;
    const listedOutlier = deviation != null && deviation > 0.4;
    if (listedOutlier) flags.push("listed_outlier");
    if (!calendarTrusted) flags.push("calendar_ignored");

    const sourceLabel =
      compSource === "airbtics_comps"
        ? "Airbtics comps"
        : compSource === "dubai_airroi_comps"
          ? "Dubai market comps"
          : "benchmark comps";

    const reason = calendarTrusted
      ? `Based on ${compCount} similar ${unitLabel} units in ${areaLabel} (${sourceLabel}, p50 ${compP50}). Calendar aligns.`
      : `Based on ${compCount} similar ${unitLabel} units in ${areaLabel} (${sourceLabel}, p50 ${compP50}). Hostaway calendar (${calendarMedian || "n/a"}) ignored — misaligned with regional comps.`;

    return {
      mode: "comp_set",
      trustedBase: compP50,
      compP50,
      compCount,
      compSource,
      calendarMedian,
      calendarTrusted,
      pmsPriceTrusted: calendarTrusted,
      compFirst: true,
      reason,
      flags: [...flags, "comp_first"],
    };
  }

  const benchmark =
    input.benchmarkP50 && input.benchmarkP50 > 0 ? input.benchmarkP50 : compP50;
  const bedroomCap = p50CeilingForBedrooms(bedrooms);
  const hardCap = Math.round(bedroomCap * 1.5);
  const ratioLimit = benchmark ? benchmark * 3 : null;
  const isOutlier =
    calendarMedian > 0 &&
    ((ratioLimit != null && calendarMedian > ratioLimit) || calendarMedian > hardCap);

  if (isOutlier && calendarMedian > 0) {
    flags.push("calendar_outlier");
    const trustedBase = achieved ?? benchmark ?? Math.round(bedroomCap * 0.65);
    return {
      mode: "calendar_corrected",
      trustedBase,
      compP50: benchmark ?? null,
      compCount,
      compSource,
      calendarMedian,
      calendarTrusted: false,
      pmsPriceTrusted: false,
      compFirst: false,
      reason: benchmark
        ? `Synced calendar median (${calendarMedian}) exceeds 3× market anchor (${benchmark}) — proposals use ${trustedBase} until Hostaway is corrected.`
        : `Synced calendar median (${calendarMedian}) exceeds ${hardCap} cap for ${unitLabel} — proposals use ${trustedBase}.`,
      flags,
    };
  }

  return {
    mode: "calendar",
    trustedBase: calendarMedian,
    compP50,
    compCount,
    compSource,
    calendarMedian,
    calendarTrusted: true,
    pmsPriceTrusted: true,
    compFirst: false,
    reason:
      compCount > 0 && compP50
        ? `Only ${compCount} comp(s) available (need ${MIN_COMP_SET_SIZE}+) — using calendar until comp set is stronger.`
        : null,
    flags: compCount > 0 ? ["weak_comp_set"] : ["no_comp_set"],
  };
}

export function buildCompAnchorReasoning(result: CompAnchoredBaseResult): string | null {
  if (!result.reason) return null;
  const prefix =
    result.mode === "comp_set"
      ? "[COMPS]"
      : result.mode === "achieved_adr"
        ? "[HISTORY]"
        : result.mode === "calendar_corrected"
          ? "[SANITY]"
          : null;
  return prefix ? `${prefix} ${result.reason}` : result.reason;
}
import { resolveBedroomsNumber } from "@/lib/pricing/bedrooms";

export interface BenchmarkRates {
  p25: number;
  p50: number;
  p75: number;
  p90?: number;
}

export interface BenchmarkSanityInput extends BenchmarkRates {
  currentPrice: number;
  bedrooms?: number | null;
  achievedAdr?: number | null;
}

export interface BenchmarkSanityResult extends BenchmarkRates {
  p90: number;
  trusted: boolean;
  rejected: boolean;
  reason: string | null;
  source: "benchmark" | "listing_derived" | "dubai_local" | "history";
  flags: string[];
}

/** Price-guard bedroom-aware p50 ceilings (AED; scale proportionally for other currencies). */
export function p50CeilingForBedrooms(bedrooms: number): number {
  const br = resolveBedroomsNumber(bedrooms, 1);
  if (br <= 1) return 1500;
  if (br <= 3) return 3000;
  if (br === 4) return 6000;
  return 10000;
}

export function deriveRatesFromAnchor(anchor: number): BenchmarkRates & { p90: number } {
  const base = Math.max(0, Math.round(anchor));
  return {
    p25: Math.round(base * 0.85),
    p50: base,
    p75: Math.round(base * 1.15),
    p90: Math.round(base * 1.3),
  };
}

/**
 * Reject benchmark percentiles that are incompatible with the listing (wrong comp set,
 * monthly/nightly confusion, or stale Lyzr synthesis). Mirrors Price Guard sanity protocol.
 */
export function assessBenchmarkSanity(input: BenchmarkSanityInput): BenchmarkSanityResult {
  const current = Math.max(0, Number(input.currentPrice) || 0);
  const p50 = Math.max(0, Number(input.p50) || 0);
  const p25 = Math.max(0, Number(input.p25) || 0);
  const p75 = Math.max(0, Number(input.p75) || 0);
  const p90 = Math.max(0, Number(input.p90) || 0);
  const bedrooms = resolveBedroomsNumber(input.bedrooms, 1);
  const flags: string[] = [];

  const ratioReject = current > 0 && p50 > current * 3;
  const inverseReject = p50 > 0 && current > p50 * 3;
  const ceilingReject = p50 > p50CeilingForBedrooms(bedrooms);

  if (ratioReject) flags.push("p50_exceeds_listed_3x");
  if (inverseReject) flags.push("listed_exceeds_p50_3x");
  if (ceilingReject) flags.push("p50_exceeds_bedroom_ceiling");

  /** Listed/calendar is implausibly high — benchmark comps are the anchor, not the bad PMS rate. */
  if (inverseReject && !ratioReject && !ceilingReject && p50 > 0) {
    return {
      p25: p25 || Math.round(p50 * 0.85),
      p50,
      p75: p75 || Math.round(p50 * 1.15),
      p90: p90 || Math.round(p50 * 1.3),
      trusted: true,
      rejected: false,
      reason: `Listed/calendar rate (${current}) exceeds 3× market p50 (${p50}) for ${
        bedrooms === 0 ? "studio" : `${bedrooms}BR`
      } — calendar likely misconfigured; using market comps.`,
      source: "benchmark",
      flags: [...flags, "listed_outlier"],
    };
  }

  const rejected = ratioReject || ceilingReject;

  if (!rejected && p50 > 0) {
    return {
      p25: p25 || Math.round(p50 * 0.85),
      p50,
      p75: p75 || Math.round(p50 * 1.15),
      p90: p90 || Math.round(p50 * 1.3),
      trusted: true,
      rejected: false,
      reason: null,
      source: "benchmark",
      flags,
    };
  }

  const achieved = input.achievedAdr && input.achievedAdr > 0 ? input.achievedAdr : null;
  const anchor = achieved ?? (current > 0 ? current : p50);

  if (anchor <= 0) {
    return {
      p25: 0,
      p50: 0,
      p75: 0,
      p90: 0,
      trusted: false,
      rejected: true,
      reason: "Benchmark percentiles missing and no listed price to derive from.",
      source: "listing_derived",
      flags: [...flags, "no_anchor"],
    };
  }

  const derived = deriveRatesFromAnchor(anchor);
  const source = achieved ? "history" : "listing_derived";

  let reason: string;
  if (ratioReject || ceilingReject) {
    reason =
      `Cached benchmark p50 (${p50}) is incompatible with listed rate (${current}) for ${bedrooms === 0 ? "studio" : `${bedrooms}BR`} — likely wrong bedroom comp set or stale synthesis. Using ${source === "history" ? "achieved ADR" : "listed rate"} (${Math.round(anchor)}) instead.`;
  } else {
    reason = `Benchmark p50 (${p50}) rejected vs listed ${current}. Using ${source === "history" ? "achieved ADR" : "listed rate"} anchor.`;
  }

  return {
    ...derived,
    trusted: false,
    rejected: true,
    reason,
    source,
    flags: [...flags, "benchmark_replaced"],
  };
}

export function applyBenchmarkSanityToPayload<T extends BenchmarkRates>(
  rates: T,
  sanity: BenchmarkSanityResult
): T & {
  benchmark_trusted: boolean;
  benchmark_rejected: boolean;
  benchmark_rejection_reason: string | null;
  benchmark_source: BenchmarkSanityResult["source"];
  benchmark_sanity_flags: string[];
} {
  return {
    ...rates,
    p25: sanity.p25,
    p50: sanity.p50,
    p75: sanity.p75,
    p90: sanity.p90,
    benchmark_trusted: sanity.trusted,
    benchmark_rejected: sanity.rejected,
    benchmark_rejection_reason: sanity.reason,
    benchmark_source: sanity.source,
    benchmark_sanity_flags: sanity.flags,
  };
}
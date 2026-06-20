import type { MarketSignal } from "@/lib/engine/waterfall";
import type { CompListing } from "@/lib/airbtics/client";
import { resolveAnchorWeights } from "./anchor-weights";

/** @deprecated Use resolveAnchorWeights() — kept for tests referencing static blend. */
export const ANCHOR_WEIGHTS = {
  compSetP50: 0.35,
  pacingAdr: 0.25,
  monthAnchorAdr: 0.2,
  listedReference: 0.1,
} as const;

/** Blend weight toward forward pacing ADR for a single day. */
export const PACING_ADR_BLEND = 0.25;

export interface CompSetPercentiles {
  p25: number | null;
  p50: number | null;
  p75: number | null;
  count: number;
  source:
    | "dubai_airroi_comps"
    | "airbtics_comps"
    | "benchmark_comps"
    | "benchmark_summary"
    | "market_summary";
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[idx]);
}

export function percentilesFromRates(rates: number[]): Omit<CompSetPercentiles, "source"> {
  const sorted = rates.filter((r) => r > 0).sort((a, b) => a - b);
  return {
    p25: percentile(sorted, 25),
    p50: percentile(sorted, 50),
    p75: percentile(sorted, 75),
    count: sorted.length,
  };
}

export function compSetPercentilesFromAirbtics(listings: CompListing[]): CompSetPercentiles {
  const rates = listings
    .map((l) => Number(l.ltm_adr ?? 0))
    .filter((r) => r > 0);
  const base = percentilesFromRates(rates);
  return { ...base, source: "airbtics_comps" };
}

export function compSetPercentilesFromBenchmark(
  comps: Array<{ avgRate?: number | null }>,
  summary?: { p25Rate?: number; p50Rate?: number; p75Rate?: number }
): CompSetPercentiles {
  const rates = comps.map((c) => Number(c.avgRate ?? 0)).filter((r) => r > 0);
  if (rates.length >= 3) {
    return { ...percentilesFromRates(rates), source: "benchmark_comps" };
  }
  if (summary?.p50Rate && summary.p50Rate > 0) {
    return {
      p25: summary.p25Rate ?? null,
      p50: Math.round(summary.p50Rate),
      p75: summary.p75Rate ?? null,
      count: rates.length,
      source: "benchmark_summary",
    };
  }
  return { p25: null, p50: null, p75: null, count: 0, source: "benchmark_comps" };
}

/**
 * Month-first market anchor. Listed Hostaway price is a weak reference when
 * monthly market ADR exists; comp-set p50 should be month-specific per day.
 */
export function resolveMarketAnchorBase(
  listedReference: number,
  signal?: MarketSignal,
  options?: { anchorScale?: number }
): { price: number; notes: string[]; usedMarketAnchor: boolean; anchorMode: string } {
  const anchorScale = options?.anchorScale ?? 1;
  if (!signal) {
    return { price: listedReference, notes: [], usedMarketAnchor: false, anchorMode: "listed_only" };
  }

  const { weights, mode, confidence } = resolveAnchorWeights(signal);
  const parts: { weight: number; value: number; label: string }[] = [];

  if (signal.monthAnchorAdr && signal.monthAnchorAdr > 0 && weights.monthAnchorAdr) {
    parts.push({
      weight: weights.monthAnchorAdr,
      value: signal.monthAnchorAdr,
      label: `month p50 ${Math.round(signal.monthAnchorAdr)}`,
    });
  }
  if (signal.compSetP50 && signal.compSetP50 > 0 && weights.compSetP50) {
    parts.push({
      weight: weights.compSetP50,
      value: signal.compSetP50,
      label: `comps p50 ${Math.round(signal.compSetP50)}`,
    });
  }
  if (signal.pacingAdr && signal.pacingAdr > 0 && weights.pacingAdr) {
    parts.push({
      weight: weights.pacingAdr,
      value: signal.pacingAdr,
      label: `pacing ${Math.round(signal.pacingAdr)}`,
    });
  }
  if (signal.annualAnchorAdr && signal.annualAnchorAdr > 0 && weights.annualAnchorAdr) {
    parts.push({
      weight: weights.annualAnchorAdr,
      value: signal.annualAnchorAdr,
      label: `annual ${Math.round(signal.annualAnchorAdr)}`,
    });
  }
  if (listedReference > 0 && weights.listedReference) {
    parts.push({
      weight: weights.listedReference,
      value: listedReference,
      label: `listed ref ${Math.round(listedReference)}`,
    });
  }

  if (parts.length === 0) {
    return { price: listedReference, notes: [], usedMarketAnchor: false, anchorMode: "listed_only" };
  }

  const totalW = parts.reduce((s, p) => s + p.weight, 0);
  let blended = parts.reduce((s, p) => s + p.value * (p.weight / totalW), 0);

  if (anchorScale !== 1 && listedReference > 0) {
    blended = listedReference + (blended - listedReference) * anchorScale;
  }

  const price = Math.round(blended);
  const usedMarketAnchor = parts.some((p) => !p.label.startsWith("listed ref"));

  const scaleNote =
    anchorScale !== 1 ? `, demand-scale ${(anchorScale * 100).toFixed(0)}%` : "";
  const notes = [
    `[MARKET] Anchor ${price} [${mode}, conf ${(confidence * 100).toFixed(0)}%${scaleNote}] (${parts
      .map((p) => `${Math.round((p.weight / totalW) * 100)}% ${p.label}`)
      .join(", ")})`,
  ];

  return { price, notes, usedMarketAnchor, anchorMode: mode };
}
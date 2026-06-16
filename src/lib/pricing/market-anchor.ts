import type { MarketSignal } from "@/lib/engine/waterfall";
import type { CompListing } from "@/lib/airbtics/client";

/** Signal weights for Pass 0 market anchor (listed price is reference-only). */
export const ANCHOR_WEIGHTS = {
  compSetP50: 0.35,
  pacingAdr: 0.25,
  monthAnchorAdr: 0.2,
  listedReference: 0.1,
} as const;

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
 * Blend comp-set, pacing, month market ADR, and a small listed-reference weight.
 * De-anchors pricing from flat PMS listing price when market data exists.
 */
export function resolveMarketAnchorBase(
  listedReference: number,
  signal?: MarketSignal
): { price: number; notes: string[]; usedMarketAnchor: boolean } {
  if (!signal) {
    return { price: listedReference, notes: [], usedMarketAnchor: false };
  }

  const parts: { weight: number; value: number; label: string }[] = [];

  if (signal.compSetP50 && signal.compSetP50 > 0) {
    parts.push({
      weight: ANCHOR_WEIGHTS.compSetP50,
      value: signal.compSetP50,
      label: `comps p50 ${Math.round(signal.compSetP50)}`,
    });
  }
  if (signal.pacingAdr && signal.pacingAdr > 0) {
    parts.push({
      weight: ANCHOR_WEIGHTS.pacingAdr,
      value: signal.pacingAdr,
      label: `pacing ${Math.round(signal.pacingAdr)}`,
    });
  }
  if (signal.monthAnchorAdr && signal.monthAnchorAdr > 0) {
    parts.push({
      weight: ANCHOR_WEIGHTS.monthAnchorAdr,
      value: signal.monthAnchorAdr,
      label: `month p50 ${Math.round(signal.monthAnchorAdr)}`,
    });
  } else if (signal.annualAnchorAdr && signal.annualAnchorAdr > 0) {
    parts.push({
      weight: ANCHOR_WEIGHTS.monthAnchorAdr,
      value: signal.annualAnchorAdr,
      label: `market annual ${Math.round(signal.annualAnchorAdr)}`,
    });
  }
  if (listedReference > 0) {
    parts.push({
      weight: ANCHOR_WEIGHTS.listedReference,
      value: listedReference,
      label: `listed ref ${Math.round(listedReference)}`,
    });
  }

  if (parts.length === 0) {
    return { price: listedReference, notes: [], usedMarketAnchor: false };
  }

  const totalW = parts.reduce((s, p) => s + p.weight, 0);
  const price = Math.round(
    parts.reduce((s, p) => s + p.value * (p.weight / totalW), 0)
  );
  const usedMarketAnchor = parts.some((p) => !p.label.startsWith("listed ref"));

  const notes = [
    `[MARKET] Anchor ${price} (${parts
      .map((p) => `${Math.round((p.weight / totalW) * 100)}% ${p.label}`)
      .join(", ")})`,
  ];

  return { price, notes, usedMarketAnchor };
}
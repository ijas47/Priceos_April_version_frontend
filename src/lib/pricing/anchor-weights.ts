import type { MarketSignal } from "@/lib/engine/waterfall";

/** Legacy static weights (listed price still influential). */
export const LEGACY_ANCHOR_WEIGHTS = {
  compSetP50: 0.35,
  pacingAdr: 0.25,
  monthAnchorAdr: 0.2,
  listedReference: 0.1,
} as const;

/**
 * Month-first weights when monthly market ADR is available.
 * Listed Hostaway price is a weak sanity check only.
 */
export const MONTH_FIRST_ANCHOR_WEIGHTS = {
  monthAnchorAdr: 0.5,
  compSetP50: 0.2,
  pacingAdr: 0.15,
  annualAnchorAdr: 0.1,
  listedReference: 0.05,
} as const;

export type AnchorWeightKey = keyof typeof MONTH_FIRST_ANCHOR_WEIGHTS;

export interface ResolvedAnchorWeights {
  weights: Partial<Record<AnchorWeightKey | "listedReference", number>>;
  mode: "month_first" | "market_blend" | "listed_only" | "comp_first";
  confidence: number;
}

/**
 * Score 0..1 for how much we trust market data over the PMS listed price.
 */
export function marketDataConfidence(signal?: MarketSignal): number {
  if (!signal) return 0;
  let score = 0;
  if (signal.monthAnchorAdr && signal.monthAnchorAdr > 0) score += 0.45;
  if (signal.compSetP50 && signal.compSetP50 > 0) score += 0.25;
  if (signal.pacingAdr && signal.pacingAdr > 0) score += 0.15;
  if (signal.forwardOccupancy != null && signal.forwardOccupancy > 0) score += 0.1;
  if (signal.annualAnchorAdr && signal.annualAnchorAdr > 0) score += 0.05;
  return Math.min(1, score);
}

export function resolveAnchorWeights(signal?: MarketSignal): ResolvedAnchorWeights {
  if (!signal) {
    return { weights: { listedReference: 1 }, mode: "listed_only", confidence: 0 };
  }

  const confidence = marketDataConfidence(signal);
  const hasMonth = !!(signal.monthAnchorAdr && signal.monthAnchorAdr > 0);
  const compFirst =
    signal.compFirst === true ||
    (signal.compSetCount != null &&
      signal.compSetCount >= 3 &&
      !!signal.compSetP50 &&
      signal.compSetP50 > 0);
  const calendarUntrusted = signal.calendarUntrusted === true;

  if (hasMonth && confidence >= 0.45) {
    const weights: ResolvedAnchorWeights["weights"] = { ...MONTH_FIRST_ANCHOR_WEIGHTS };
    if (!signal.annualAnchorAdr || signal.annualAnchorAdr <= 0) {
      delete weights.annualAnchorAdr;
      weights.monthAnchorAdr = (weights.monthAnchorAdr ?? 0) + 0.1;
    }
    if (!signal.pacingAdr || signal.pacingAdr <= 0) {
      delete weights.pacingAdr;
      weights.monthAnchorAdr = (weights.monthAnchorAdr ?? 0) + 0.1;
    }
    if (!signal.compSetP50 || signal.compSetP50 <= 0) {
      delete weights.compSetP50;
      weights.monthAnchorAdr = (weights.monthAnchorAdr ?? 0) + 0.15;
    }
    if (compFirst || calendarUntrusted) {
      const listedW = weights.listedReference ?? 0;
      delete weights.listedReference;
      weights.compSetP50 = (weights.compSetP50 ?? 0) + listedW * 0.6;
      weights.monthAnchorAdr = (weights.monthAnchorAdr ?? 0) + listedW * 0.4;
    }
    return {
      weights,
      mode: compFirst ? "comp_first" : "month_first",
      confidence,
    };
  }

  const weights: Partial<Record<AnchorWeightKey | "listedReference", number>> = {
    ...LEGACY_ANCHOR_WEIGHTS,
  };
  if (!signal.monthAnchorAdr) delete weights.monthAnchorAdr;
  if (!signal.compSetP50) delete weights.compSetP50;
  if (!signal.pacingAdr) delete weights.pacingAdr;
  if (confidence < 0.2 && !compFirst) {
    weights.listedReference = 0.35;
  }
  if (compFirst || calendarUntrusted) {
    const listedW = weights.listedReference ?? 0;
    delete weights.listedReference;
    if (weights.compSetP50) {
      weights.compSetP50 = (weights.compSetP50 ?? 0) + listedW;
    } else if (weights.monthAnchorAdr) {
      weights.monthAnchorAdr = (weights.monthAnchorAdr ?? 0) + listedW;
    }
  }

  const hasMarket = Object.keys(weights).some((k) => k !== "listedReference");
  return {
    weights,
    mode: compFirst ? "comp_first" : hasMarket ? "market_blend" : "listed_only",
    confidence,
  };
}

export function usesMonthFirstAnchor(signal?: MarketSignal): boolean {
  const mode = resolveAnchorWeights(signal).mode;
  return mode === "month_first" || mode === "comp_first";
}
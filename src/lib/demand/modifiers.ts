/**
 * Demand Modifier Computation
 *
 * Computes weighted demand modifiers from source-market signals.
 * Each source market contributes to a composite demand index based on
 * its weight and current signal strength. The result drives pricing
 * adjustments in the revenue engine.
 */

import { getSourceMarkets, type SourceMarket } from "./source-markets";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DemandSignal {
  /** Source market id (must match a SourceMarket.id in the registry) */
  sourceMarketId: string;
  /** Signal classification */
  signal: "surge" | "normal" | "weak" | "disrupted";
  /** Magnitude multiplier: 1 = normal baseline, >1 = surge, <1 = weak */
  magnitude: number;
  /** Human-readable reason for the signal */
  reason?: string;
  /** Confidence level 0-1 */
  confidence: number;
  /** ISO date string after which the signal should be discarded */
  expiresAt?: string;
}

export interface DemandModifierResult {
  /** Weighted aggregate demand index. 100 = baseline, >100 = above average */
  compositeDemandIndex: number;
  /** Suggested price adjustment percentage (positive = increase) */
  priceModifierPct: number;
  /** Active signals that contributed to the result */
  activeSignals: DemandSignal[];
  /** Market id with the highest weighted contribution this period */
  dominantMarket: string;
  /** Per-market breakdown of contributions */
  breakdown: Array<{
    marketId: string;
    marketName: string;
    weight: number;
    signal: string;
    contribution: number;
  }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How much a seasonal peak boosts a market's effective weight */
const PEAK_WEIGHT_BOOST = 1.4;

/**
 * Elasticity-to-price mapping scale factor.
 * A composite demand index of 120 (20% above baseline) with an average
 * elasticity of -0.4 should suggest roughly +8% price increase.
 */
const PRICE_MODIFIER_SCALE = 0.5;

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Check whether a source market is currently in its seasonal peak
 * for a given calendar month.
 */
export function isSourceMarketPeak(market: SourceMarket, month: number): boolean {
  return market.seasonalPeaks.includes(month);
}

/**
 * Get the dominant (highest effective weight) source market for a month.
 */
export function getDominantSourceMarket(
  marketTemplate: string,
  month: number,
): SourceMarket | undefined {
  const markets = getSourceMarkets(marketTemplate);
  if (markets.length === 0) return undefined;

  let best: SourceMarket | undefined;
  let bestWeight = -1;

  for (const m of markets) {
    const effectiveWeight = isSourceMarketPeak(m, month)
      ? m.baseWeight * PEAK_WEIGHT_BOOST
      : m.baseWeight;
    if (effectiveWeight > bestWeight) {
      bestWeight = effectiveWeight;
      best = m;
    }
  }

  return best;
}

/**
 * Generate default seasonal baseline signals when no external data is
 * available. Each market gets a "normal" signal with magnitude adjusted
 * by whether the month is a seasonal peak or trough.
 */
export function getDefaultSignals(
  marketTemplate: string,
  month: number,
): DemandSignal[] {
  const markets = getSourceMarkets(marketTemplate);

  return markets.map((m) => {
    const isPeak = isSourceMarketPeak(m, month);
    return {
      sourceMarketId: m.id,
      signal: "normal" as const,
      magnitude: isPeak ? 1.15 : 0.9,
      reason: isPeak
        ? `${m.name} seasonal peak month`
        : `${m.name} off-peak / baseline`,
      confidence: 0.6,
    };
  });
}

/**
 * Compute the weighted demand modifier from a set of active signals.
 *
 * Algorithm:
 * 1. For each source market, look up its base weight and boost if in peak.
 * 2. Find the matching signal (or use default normal).
 * 3. Compute contribution = effectiveWeight * magnitude * confidence.
 * 4. Normalize contributions so that an all-normal, all-confidence-1 scenario = 100.
 * 5. Derive priceModifierPct from the composite index and avg price elasticity.
 */
export function computeDemandModifier(
  marketTemplate: string,
  month: number,
  signals: DemandSignal[],
): DemandModifierResult {
  const markets = getSourceMarkets(marketTemplate);

  // Geography-agnostic default: if we have no source-market profile for this
  // destination, return a NEUTRAL modifier (no demand bias) rather than
  // borrowing another market's profile.
  if (markets.length === 0) {
    return {
      compositeDemandIndex: 100,
      priceModifierPct: 0,
      activeSignals: [],
      dominantMarket: "",
      breakdown: [],
    };
  }

  // Build a lookup of signals by market id
  const signalMap = new Map<string, DemandSignal>();
  for (const s of signals) {
    // Skip expired signals
    if (s.expiresAt && new Date(s.expiresAt) < new Date()) continue;
    signalMap.set(s.sourceMarketId, s);
  }

  // Compute effective weights (with peak boost) and total
  const effectiveWeights = new Map<string, number>();
  let totalEffectiveWeight = 0;

  for (const m of markets) {
    const ew = isSourceMarketPeak(m, month)
      ? m.baseWeight * PEAK_WEIGHT_BOOST
      : m.baseWeight;
    effectiveWeights.set(m.id, ew);
    totalEffectiveWeight += ew;
  }

  // Compute per-market contributions
  const breakdown: DemandModifierResult["breakdown"] = [];
  let weightedSum = 0;
  let weightedElasticity = 0;
  const activeSignals: DemandSignal[] = [];
  let dominantMarketId = "";
  let dominantContribution = -1;

  for (const m of markets) {
    const ew = effectiveWeights.get(m.id) ?? m.baseWeight;
    const normalizedWeight = totalEffectiveWeight > 0 ? ew / totalEffectiveWeight : 0;

    // Find signal for this market, or synthesize a default
    let signal = signalMap.get(m.id);
    if (!signal) {
      const isPeak = isSourceMarketPeak(m, month);
      signal = {
        sourceMarketId: m.id,
        signal: "normal",
        magnitude: isPeak ? 1.15 : 0.9,
        confidence: 0.5,
      };
    } else {
      activeSignals.push(signal);
    }

    // Contribution: normalized weight * magnitude (confidence-adjusted)
    const effectiveMagnitude =
      signal.magnitude * signal.confidence +
      1.0 * (1 - signal.confidence); // blend toward 1.0 at low confidence
    const contribution = normalizedWeight * effectiveMagnitude * 100;

    weightedSum += contribution;
    weightedElasticity += normalizedWeight * Math.abs(m.priceElasticity);

    if (contribution > dominantContribution) {
      dominantContribution = contribution;
      dominantMarketId = m.id;
    }

    breakdown.push({
      marketId: m.id,
      marketName: m.name,
      weight: Math.round(normalizedWeight * 1000) / 10, // percentage with 1 decimal
      signal: signal.signal,
      contribution: Math.round(contribution * 10) / 10,
    });
  }

  // Composite demand index (100 = baseline)
  const compositeDemandIndex = Math.round(weightedSum * 10) / 10;

  // Price modifier: how much to adjust price based on demand and elasticity
  // If demand is 110 (10% above baseline), and avg elasticity is 0.4,
  // then price modifier = (110 - 100) / 100 * PRICE_MODIFIER_SCALE / avgElasticity * 100
  const demandDelta = (compositeDemandIndex - 100) / 100;
  const avgElasticity = weightedElasticity > 0 ? weightedElasticity : 0.4;
  const priceModifierPct =
    Math.round(demandDelta * PRICE_MODIFIER_SCALE * (1 / avgElasticity) * 100 * 10) / 10;

  // Sort breakdown by contribution descending
  breakdown.sort((a, b) => b.contribution - a.contribution);

  return {
    compositeDemandIndex,
    priceModifierPct,
    activeSignals,
    dominantMarket: dominantMarketId,
    breakdown,
  };
}

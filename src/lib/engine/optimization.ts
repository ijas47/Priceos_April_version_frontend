/**
 * Revenue optimization layer.
 *
 * Sits on top of the deterministic pricing waterfall. Given the rulebook
 * price for a day, it nudges toward the elasticity revenue-optimal price
 * (learned from this listing's own booking history) and applies a bounded
 * source-market demand modifier — always clamped inside the listing's
 * floor/ceiling guardrails, and never moving more than ±maxShiftPct from the
 * rulebook price in a single run.
 *
 * Confidence-weighted: with little/no booking history the elasticity weight
 * is ~0, so the output collapses back to the rulebook price (plus at most a
 * small demand nudge). The model "earns trust" as data accumulates.
 */

import { optimalPrice } from "@/lib/elasticity/model";
import type { ElasticityParams } from "@/lib/elasticity/types";

/** Sample size at which the elasticity model is fully trusted (weight = 1). */
export const FULL_TRUST_SAMPLE = 30;

/** Hard cap on how far the demand modifier alone may move a price (%). */
export const MAX_DEMAND_SHIFT_PCT = 15;

/** Default cap on total movement away from the rulebook price per run. */
export const DEFAULT_MAX_SHIFT_PCT = 0.25;

export interface OptimizedPrice {
  /** Elasticity revenue-optimal price within the band. */
  optimalPrice: number;
  /** Confidence weight applied to the elasticity price (0..1). */
  weight: number;
  /** Booking probability at the optimal price (0..1). */
  pBook: number;
  /** Demand modifier actually applied (%, already bounded). */
  demandModifierPct: number;
  /** Final price: blended, demand-nudged, shift-capped, guardrail-clamped. */
  finalPrice: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Combine the rulebook price with the elasticity-optimal price and a demand
 * modifier. Pure & deterministic — safe to unit test.
 */
export function computeOptimizedPrice(args: {
  rulebookPrice: number;
  params: ElasticityParams;
  floor: number;
  ceiling: number;
  demandModifierPct?: number;
  maxShiftPct?: number;
}): OptimizedPrice {
  const {
    rulebookPrice,
    params,
    floor,
    ceiling,
    demandModifierPct = 0,
    maxShiftPct = DEFAULT_MAX_SHIFT_PCT,
  } = args;

  // Degenerate / inverted band → never optimize, just pass the rulebook
  // price through (still clamped if the band is a single point).
  if (!(ceiling > floor) || !Number.isFinite(rulebookPrice)) {
    const safe = Number.isFinite(rulebookPrice) ? rulebookPrice : floor;
    return {
      optimalPrice: safe,
      weight: 0,
      pBook: 0,
      demandModifierPct: 0,
      finalPrice: Math.round(clamp(safe, floor, Math.max(floor, ceiling)) * 100) / 100,
    };
  }

  const opt = optimalPrice(params, floor, ceiling);

  // Confidence: trust elasticity more as sample size grows.
  const weight = clamp(Math.min(params.sampleSize, FULL_TRUST_SAMPLE) / FULL_TRUST_SAMPLE, 0, 1);
  const blended = (1 - weight) * rulebookPrice + weight * opt.price;

  // Apply a bounded source-market demand nudge.
  const dm = clamp(demandModifierPct, -MAX_DEMAND_SHIFT_PCT, MAX_DEMAND_SHIFT_PCT);
  let priced = blended * (1 + dm / 100);

  // Cap total movement away from the rulebook price (stability / trust).
  priced = clamp(priced, rulebookPrice * (1 - maxShiftPct), rulebookPrice * (1 + maxShiftPct));

  // Hard guardrail: never escape the floor/ceiling band.
  priced = clamp(priced, floor, ceiling);

  return {
    optimalPrice: opt.price,
    weight: Math.round(weight * 1000) / 1000,
    pBook: opt.pBook,
    demandModifierPct: dm,
    finalPrice: Math.round(priced * 100) / 100,
  };
}

/**
 * Whether the optimization layer DRIVES the proposed price (true) or merely
 * records a shadow value alongside the rulebook price (false, the default).
 * Controlled by the ELASTICITY_PRICING env flag so it can be enabled per
 * environment after validation. Accepts "on"/"true"/"1".
 */
export function isElasticityPricingEnabled(): boolean {
  const flag = (process.env.ELASTICITY_PRICING ?? "").toLowerCase();
  return flag === "on" || flag === "true" || flag === "1";
}

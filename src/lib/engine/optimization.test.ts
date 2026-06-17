import { describe, it, expect, afterEach } from "vitest";
import {
  computeOptimizedPrice,
  isElasticityPricingEnabled,
  FULL_TRUST_SAMPLE,
} from "./optimization";
import type { ElasticityParams } from "@/lib/elasticity/types";

function params(sampleSize: number): ElasticityParams {
  return {
    beta0: 2.5,
    beta1: -3.8,
    adr: 500,
    sampleSize,
    fittedAt: new Date().toISOString(),
  };
}

const FLOOR = 300;
const CEIL = 1200;

describe("computeOptimizedPrice - guardrail safety", () => {
  it("never escapes the floor/ceiling band", () => {
    for (const rb of [100, 300, 500, 900, 1200, 5000]) {
      for (const n of [0, 5, 30, 200]) {
        const out = computeOptimizedPrice({
          rulebookPrice: rb,
          params: params(n),
          floor: FLOOR,
          ceiling: CEIL,
          demandModifierPct: 50, // intentionally extreme; must be bounded
        });
        expect(out.finalPrice).toBeGreaterThanOrEqual(FLOOR);
        expect(out.finalPrice).toBeLessThanOrEqual(CEIL);
        expect(Number.isFinite(out.finalPrice)).toBe(true);
      }
    }
  });

  it("collapses to ~rulebook price when there is no booking history", () => {
    const rb = 600;
    const out = computeOptimizedPrice({
      rulebookPrice: rb,
      params: params(0),
      floor: FLOOR,
      ceiling: CEIL,
      demandModifierPct: 0,
    });
    expect(out.weight).toBe(0);
    expect(out.finalPrice).toBe(rb);
  });

  it("gives the elasticity model full weight at the trust threshold", () => {
    const out = computeOptimizedPrice({
      rulebookPrice: 600,
      params: params(FULL_TRUST_SAMPLE),
      floor: FLOOR,
      ceiling: CEIL,
    });
    expect(out.weight).toBe(1);
  });

  it("never moves more than the shift cap from the rulebook price", () => {
    const rb = 600;
    const out = computeOptimizedPrice({
      rulebookPrice: rb,
      params: params(200),
      floor: FLOOR,
      ceiling: CEIL,
      demandModifierPct: 15,
      maxShiftPct: 0.25,
    });
    expect(out.finalPrice).toBeLessThanOrEqual(rb * 1.25 + 0.01);
    expect(out.finalPrice).toBeGreaterThanOrEqual(rb * 0.75 - 0.01);
  });

  it("passes the rulebook price through for a degenerate band", () => {
    const out = computeOptimizedPrice({
      rulebookPrice: 500,
      params: params(200),
      floor: 500,
      ceiling: 500,
    });
    expect(out.weight).toBe(0);
    expect(out.finalPrice).toBe(500);
  });

  it("bounds the demand modifier to ±15% even when given a huge value", () => {
    const out = computeOptimizedPrice({
      rulebookPrice: 600,
      params: params(0),
      floor: FLOOR,
      ceiling: CEIL,
      demandModifierPct: 999,
    });
    expect(out.demandModifierPct).toBe(15);
  });
});

describe("isElasticityPricingEnabled", () => {
  afterEach(() => {
    delete process.env.ELASTICITY_PRICING;
  });

  it("is enabled by default when the flag is unset", () => {
    delete process.env.ELASTICITY_PRICING;
    expect(isElasticityPricingEnabled()).toBe(true);
  });

  it("is disabled (shadow mode) only when explicitly set to off", () => {
    process.env.ELASTICITY_PRICING = "off";
    expect(isElasticityPricingEnabled()).toBe(false);
  });

  it("stays enabled for on/true/1", () => {
    for (const v of ["on", "true", "1"]) {
      process.env.ELASTICITY_PRICING = v;
      expect(isElasticityPricingEnabled()).toBe(true);
    }
  });
});

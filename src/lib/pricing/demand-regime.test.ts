import { describe, expect, it } from "vitest";
import {
  adjustBenchmarkVerdictForRegime,
  resolveDemandRegime,
  resolveDistressedEffectiveFloor,
} from "./demand-regime";

describe("demand regime", () => {
  it("flags distressed summer war slump with zero occupancy", () => {
    const r = resolveDemandRegime({
      forwardOccupancy: 0.16,
      portfolioOccupancyPct: 0,
      bookingPaceRatio: 0.3,
      crisisTier: 2,
      month: 6,
      city: "Dubai",
      countryCode: "AE",
    });
    expect(r.regime).toBe("distressed");
    expect(r.suspendCompFloorGuard).toBe(true);
    expect(r.anchorScale).toBeLessThan(0.5);
  });

  it("lowers effective floor below static comp floor in distressed mode", () => {
    const regime = resolveDemandRegime({
      forwardOccupancy: 0.16,
      portfolioOccupancyPct: 0,
      crisisTier: 2,
      month: 6,
      city: "Dubai",
      countryCode: "AE",
    });
    const floor = resolveDistressedEffectiveFloor({
      staticFloor: 633,
      listedPrice: 162,
      pacingAdr: 180,
      regime,
    });
    expect(floor).toBeLessThanOrEqual(182);
  });

  it("rewrites underpriced verdict in distressed markets", () => {
    expect(adjustBenchmarkVerdictForRegime("UNDERPRICED", "distressed", 0)).toBe(
      "DEFENSIVE_HOLD"
    );
  });
});
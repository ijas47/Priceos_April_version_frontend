import { describe, expect, it } from "vitest";
import { resolveDynamicFloor } from "./dynamic-floor";

const safety = {
  enabled: true,
  adrMultiplier: 1.1,
  beyondDaysOut: 180,
};

describe("resolveDynamicFloor", () => {
  it("uses static floor when STLY safety does not apply (inside 180d window)", () => {
    const result = resolveDynamicFloor({
      staticFloor: 400,
      leadTimeDays: 30,
      stlyRate: 500,
      safetyConfig: safety,
    });
    expect(result.floor).toBe(400);
    expect(result.stlySafetyFloor).toBeNull();
  });

  it("raises floor from STLY × multiplier far out", () => {
    const result = resolveDynamicFloor({
      staticFloor: 400,
      leadTimeDays: 200,
      stlyRate: 500,
      safetyConfig: safety,
    });
    expect(result.stlySafetyFloor).toBe(550);
    expect(result.floor).toBe(550);
    expect(result.note).toContain("STLY safety");
  });

  it("keeps static floor when it is already higher than STLY safety", () => {
    const result = resolveDynamicFloor({
      staticFloor: 600,
      leadTimeDays: 200,
      stlyRate: 500,
      safetyConfig: safety,
    });
    expect(result.floor).toBe(600);
  });

  it("applies near-term comp p25 guard", () => {
    const result = resolveDynamicFloor({
      staticFloor: 300,
      leadTimeDays: 14,
      stlyRate: null,
      compSetP25: 500,
    });
    expect(result.compGuardFloor).toBe(425);
    expect(result.floor).toBe(425);
  });
});
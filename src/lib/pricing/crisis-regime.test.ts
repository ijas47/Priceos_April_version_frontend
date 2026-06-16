import { describe, expect, it } from "vitest";
import { applyCrisisAdjustment, detectCrisisRegime } from "./crisis-regime";

describe("detectCrisisRegime", () => {
  it("detects tier 3 travel advisory", () => {
    const regime = detectCrisisRegime([
      {
        name: "UAE travel advisory issued",
        description: "Foreign offices advise against non-essential travel",
        confidence: 85,
      },
    ]);
    expect(regime.tier).toBe(3);
  });

  it("escalates to tier 4 with multiple severe signals", () => {
    const regime = detectCrisisRegime([
      { name: "Airport shutdown extended", confidence: 90 },
      { name: "Travel advisory updated", confidence: 80 },
    ]);
    expect(regime.tier).toBeGreaterThanOrEqual(3);
  });

  it("returns tier 0 for normal events", () => {
    const regime = detectCrisisRegime([
      { name: "Dubai Food Festival", description: "Culinary week downtown", confidence: 90 },
    ]);
    expect(regime.tier).toBe(0);
  });
});

describe("applyCrisisAdjustment", () => {
  it("caps price at comp p25 on tier 4", () => {
    const result = applyCrisisAdjustment(600, 4, {
      listedReference: 500,
      compSetP25: 420,
    });
    expect(result.price).toBe(420);
    expect(result.note).toContain("CRISIS T4");
  });
});
import { describe, expect, it } from "vitest";
import {
  clampAdjustedPrice,
  changePctFromPrices,
  validateBulkAdjustInput,
} from "./bulk-adjust";

describe("clampAdjustedPrice", () => {
  it("applies percentage and respects floor", () => {
    expect(clampAdjustedPrice(200, -20, { priceFloor: 180, priceCeiling: 0 })).toBe(180);
  });

  it("applies percentage and respects ceiling", () => {
    expect(clampAdjustedPrice(200, 50, { priceFloor: 0, priceCeiling: 250 })).toBe(250);
  });

  it("rounds adjusted price", () => {
    expect(clampAdjustedPrice(165, 10, { priceFloor: 0, priceCeiling: 0 })).toBe(182);
  });
});

describe("validateBulkAdjustInput", () => {
  it("rejects out-of-range pct", () => {
    expect(
      validateBulkAdjustInput({ adjPct: 80, startDate: "2026-06-01", endDate: "2026-06-30" })
    ).toContain("-50");
  });

  it("accepts valid input", () => {
    expect(
      validateBulkAdjustInput({ adjPct: -10, startDate: "2026-06-01", endDate: "2026-06-30" })
    ).toBeNull();
  });
});

describe("changePctFromPrices", () => {
  it("computes rounded percent change", () => {
    expect(changePctFromPrices(100, 110)).toBe(10);
  });
});
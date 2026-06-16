import { describe, expect, it } from "vitest";
import { resolveDisplayRate } from "./display-rate";

describe("resolveDisplayRate", () => {
  it("labels flat PMS calendar rates as Listed Rate", () => {
    const result = resolveDisplayRate({
      listedPrice: 187,
      calendarPrices: [187, 187, 187],
      avgCalendarRate: 187,
    });
    expect(result.rateLabel).toBe("Listed Rate");
    expect(result.displayRate).toBe(187);
  });

  it("labels varied calendar rates as Avg Rate", () => {
    const result = resolveDisplayRate({
      listedPrice: 187,
      calendarPrices: [180, 200, 210],
      avgCalendarRate: 196.67,
    });
    expect(result.rateLabel).toBe("Avg Rate");
    expect(result.displayRate).toBe(196.67);
  });

  it("falls back to listed price when no calendar data", () => {
    const result = resolveDisplayRate({
      listedPrice: 350,
      calendarPrices: [],
      avgCalendarRate: null,
    });
    expect(result.rateLabel).toBe("Listed Rate");
    expect(result.displayRate).toBe(350);
  });
});
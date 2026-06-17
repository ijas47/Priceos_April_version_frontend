import { describe, expect, it } from "vitest";
import { formatRateForLabel, resolveDisplayRate } from "./display-rate";

describe("resolveDisplayRate", () => {
  it("labels flat PMS calendar rates as Listed Rate", () => {
    const result = resolveDisplayRate({
      listedPrice: 187,
      calendarPrices: [187, 187, 187],
      avgCalendarRate: 187,
    });
    expect(result.rateLabel).toBe("Listed Rate");
    expect(result.displayRate).toBe(187);
    expect(result.listedPrice).toBe(187);
  });

  it("prefers synced calendar rate over stale Listing.price when flat", () => {
    const result = resolveDisplayRate({
      listedPrice: 904,
      calendarPrices: [1200, 1200, 1200],
      avgCalendarRate: 1200,
    });
    expect(result.rateLabel).toBe("Listed Rate");
    expect(result.displayRate).toBe(1200);
    expect(result.listedPrice).toBe(1200);
  });

  it("labels varied calendar rates as Avg Rate", () => {
    const result = resolveDisplayRate({
      listedPrice: 187,
      calendarPrices: [180, 200, 210],
      avgCalendarRate: 196.67,
      calendarListedPrice: 200,
    });
    expect(result.rateLabel).toBe("Avg Rate");
    expect(result.displayRate).toBe(196.67);
    expect(result.listedPrice).toBe(200);
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

describe("formatRateForLabel", () => {
  it("shows listedPrice for Listed Rate label", () => {
    expect(
      formatRateForLabel("Listed Rate", {
        listedPrice: 1200,
        displayRate: 904,
        avgCalendarRate: 904,
      })
    ).toBe(1200);
  });

  it("shows displayRate for Avg Rate label", () => {
    expect(
      formatRateForLabel("Avg Rate", {
        listedPrice: 200,
        displayRate: 904,
        avgCalendarRate: 904,
      })
    ).toBe(904);
  });
});
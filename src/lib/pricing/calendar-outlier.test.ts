import { describe, expect, it } from "vitest";
import { correctOutlierCalendarBase } from "./listing-price-sanity";

describe("correctOutlierCalendarBase", () => {
  it("corrects 10k studio calendar to market p50", () => {
    const result = correctOutlierCalendarBase({
      calendarPrices: Array(30).fill(9981),
      bedrooms: 0,
      benchmarkP50: 450,
    });
    expect(result.corrected).toBe(true);
    expect(result.trustedBase).toBe(450);
    expect(result.flags).toContain("calendar_outlier");
  });

  it("leaves sane studio calendar unchanged", () => {
    const result = correctOutlierCalendarBase({
      calendarPrices: [420, 430, 440, 450],
      bedrooms: 0,
      benchmarkP50: 450,
    });
    expect(result.corrected).toBe(false);
    expect(result.trustedBase).toBe(440);
  });
});
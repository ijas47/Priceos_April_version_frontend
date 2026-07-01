import { describe, expect, it } from "vitest";
import { buildGapAnalysis } from "./gap-analysis";

describe("buildGapAnalysis", () => {
  it("detects a 1-night orphan gap between bookings", () => {
    const result = buildGapAnalysis([
      { date: "2026-04-14", status: "booked", min_stay: 2, current_price: 550 },
      { date: "2026-04-15", status: "available", min_stay: 2, current_price: 550 },
      { date: "2026-04-16", status: "booked", min_stay: 2, current_price: 550 },
    ]);

    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]).toMatchObject({
      date_from: "2026-04-15",
      date_to: "2026-04-15",
      nights: 1,
      gap_type: "orphan",
    });
    expect(result.los_recommendations[0]?.recommended_min_stay).toBe(1);
  });

  it("ignores trailing availability without a booking after", () => {
    const result = buildGapAnalysis([
      { date: "2026-04-14", status: "booked", min_stay: 1, current_price: 500 },
      { date: "2026-04-15", status: "available", min_stay: 1, current_price: 500 },
      { date: "2026-04-16", status: "available", min_stay: 1, current_price: 500 },
    ]);

    expect(result.gaps).toHaveLength(0);
  });
});
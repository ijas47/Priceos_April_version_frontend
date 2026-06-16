import { describe, expect, it } from "vitest";
import {
  computeBookingPace,
  resolvePaceDemandMultiplier,
  paceRatioForLeadTime,
} from "./booking-pace";

describe("computeBookingPace", () => {
  it("computes pace ratio vs STLY booked nights", () => {
    const forward = [
      { date: "2026-06-16", status: "booked" },
      { date: "2026-06-17", status: "available" },
      { date: "2026-06-18", status: "booked" },
    ];
    const stly = [
      { date: "2025-06-16", status: "booked" },
      { date: "2025-06-17", status: "booked" },
      { date: "2025-06-18", status: "booked" },
    ];

    const summary = computeBookingPace({
      today: "2026-06-16",
      forwardInventory: forward,
      forwardReservations: [],
      stlyInventory: stly,
      stlyReservations: [],
      horizons: [3],
    });

    expect(summary.windows[0].bookedNights).toBe(2);
    expect(summary.windows[0].stlyBookedNights).toBe(3);
    expect(summary.windows[0].paceRatio).toBeCloseTo(0.667, 2);
  });
});

describe("resolvePaceDemandMultiplier", () => {
  it("discounts when behind STLY pace", () => {
    const result = resolvePaceDemandMultiplier(0.8);
    expect(result.multiplier).toBeLessThan(1);
    expect(result.note).toContain("[PACE]");
  });

  it("is neutral on pace", () => {
    expect(resolvePaceDemandMultiplier(1.0).multiplier).toBe(1);
  });
});

describe("paceRatioForLeadTime", () => {
  it("selects horizon by lead time", () => {
    const summary = computeBookingPace({
      today: "2026-06-16",
      forwardInventory: [],
      forwardReservations: [],
      stlyInventory: [],
      stlyReservations: [],
      horizons: [30, 60, 90],
    });
    expect(paceRatioForLeadTime(summary, 10)).toEqual(
      summary.windows.find((w) => w.horizonDays === 30)?.paceRatio
    );
  });
});
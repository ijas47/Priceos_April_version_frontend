import { describe, expect, it } from "vitest";
import {
  computeDaysSinceLastBooking,
  resolveBookingRecencyDiscountPct,
} from "./booking-recency";

const config = {
  enabled: true,
  minDiscountPct: 5,
  maxDiscountPct: 15,
  minDaysSinceBooking: 15,
  maxDaysSinceBooking: 45,
  forwardDays: 30,
};

describe("resolveBookingRecencyDiscountPct", () => {
  it("returns null when booking was recent", () => {
    expect(resolveBookingRecencyDiscountPct(config, 10, 7)).toBeNull();
  });

  it("ramps discount with days since last booking", () => {
    expect(resolveBookingRecencyDiscountPct(config, 15, 7)).toBe(5);
    expect(resolveBookingRecencyDiscountPct(config, 45, 7)).toBe(15);
  });

  it("only applies within forwardDays lead time", () => {
    expect(resolveBookingRecencyDiscountPct(config, 30, 31)).toBeNull();
  });
});

describe("computeDaysSinceLastBooking", () => {
  it("computes days from last checkout", () => {
    const days = computeDaysSinceLastBooking(new Date("2026-06-16"), "2026-06-01");
    expect(days).toBe(15);
  });
});
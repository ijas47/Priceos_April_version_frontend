import { describe, it, expect } from "vitest";
import {
  computeDay,
  type ListingConfig,
  type Rule,
  type BookingContext,
  type MarketSignal,
} from "./waterfall";

/**
 * Characterization tests for the pricing waterfall. These pin the most
 * important correctness property — the final price ALWAYS lands inside the
 * floor/ceiling band — plus a few core behaviors, so the 295-line computeDay
 * can be refactored safely later.
 */

function makeConfig(overrides: Partial<ListingConfig> = {}): ListingConfig {
  return {
    basePrice: 500,
    absoluteMinPrice: 300,
    absoluteMaxPrice: 1200,
    defaultMinStay: 1,
    defaultMaxStay: 30,
    lowestMinStayAllowed: 1,
    allowedCheckinDays: [1, 1, 1, 1, 1, 1, 1],
    allowedCheckoutDays: [1, 1, 1, 1, 1, 1, 1],
    lastMinuteEnabled: false,
    lastMinuteDaysOut: 7,
    lastMinuteDiscountPct: 20,
    lastMinuteMinStay: null,
    farOutEnabled: false,
    farOutDaysOut: 180,
    farOutMarkupPct: 15,
    farOutMinStay: null,
    dowPricingEnabled: false,
    dowDays: [],
    dowPriceAdjPct: 0,
    dowMinStay: null,
    gapPreventionEnabled: false,
    minFragmentThreshold: 2,
    gapFillEnabled: false,
    gapFillLengthMin: 1,
    gapFillLengthMax: 3,
    gapFillDiscountPct: 15,
    gapFillOverrideCico: false,
    ...overrides,
  };
}

const noBooking: BookingContext = {
  isBooked: false,
  gapLength: null,
  gapStart: null,
  gapEnd: null,
};

const today = new Date("2026-06-14T00:00:00.000Z");
const date = new Date("2026-08-01T00:00:00.000Z"); // ~48 days out

describe("computeDay — floor/ceiling invariant", () => {
  it("keeps the base case at base price within the band", () => {
    const res = computeDay(date, today, makeConfig(), [], noBooking);
    expect(res.price).toBe(500);
    expect(res.price).toBeGreaterThanOrEqual(300);
    expect(res.price).toBeLessThanOrEqual(1200);
  });

  it("clamps an absurd positive rule override to the ceiling", () => {
    const rule: Rule = {
      id: 1,
      ruleType: "EVENT",
      name: "Mega surge",
      enabled: true,
      priority: 10,
      startDate: "2026-07-01",
      endDate: "2026-09-01",
      daysOfWeek: null,
      minNights: null,
      priceOverride: 999999,
      priceAdjPct: null,
      minPriceOverride: null,
      maxPriceOverride: null,
      minStayOverride: null,
      isBlocked: false,
      closedToArrival: false,
      closedToDeparture: false,
      suspendLastMinute: false,
      suspendGapFill: false,
    };
    const res = computeDay(date, today, makeConfig(), [rule], noBooking);
    expect(res.price).toBeLessThanOrEqual(1200);
  });

  it("clamps an absurd negative adjustment to the floor", () => {
    const rule: Rule = {
      id: 2,
      ruleType: "SEASON",
      name: "Deep discount",
      enabled: true,
      priority: 10,
      startDate: "2026-07-01",
      endDate: "2026-09-01",
      daysOfWeek: null,
      minNights: null,
      priceOverride: null,
      priceAdjPct: -95,
      minPriceOverride: null,
      maxPriceOverride: null,
      minStayOverride: null,
      isBlocked: false,
      closedToArrival: false,
      closedToDeparture: false,
      suspendLastMinute: false,
      suspendGapFill: false,
    };
    const res = computeDay(date, today, makeConfig(), [rule], noBooking);
    expect(res.price).toBeGreaterThanOrEqual(300);
  });

  it("respects per-rule min/max price overrides as the effective band", () => {
    const rule: Rule = {
      id: 3,
      ruleType: "EVENT",
      name: "Override band",
      enabled: true,
      priority: 10,
      startDate: "2026-07-01",
      endDate: "2026-09-01",
      daysOfWeek: null,
      minNights: null,
      priceOverride: 999999,
      priceAdjPct: null,
      minPriceOverride: 400,
      maxPriceOverride: 800,
      minStayOverride: null,
      isBlocked: false,
      closedToArrival: false,
      closedToDeparture: false,
      suspendLastMinute: false,
      suspendGapFill: false,
    };
    const res = computeDay(date, today, makeConfig(), [rule], noBooking);
    expect(res.price).toBeLessThanOrEqual(800);
    expect(res.price).toBeGreaterThanOrEqual(400);
  });

  it("survives a degenerate config without producing NaN", () => {
    const res = computeDay(
      date,
      today,
      makeConfig({ basePrice: 0, absoluteMinPrice: 0, absoluteMaxPrice: 0 }),
      [],
      noBooking
    );
    expect(Number.isFinite(res.price)).toBe(true);
  });
});

describe("computeDay — rule effects", () => {
  it("marks the day unavailable for an ADMIN_BLOCK rule", () => {
    const block: Rule = {
      id: 4,
      ruleType: "ADMIN_BLOCK",
      name: "Owner block",
      enabled: true,
      priority: 100,
      startDate: "2026-07-01",
      endDate: "2026-09-01",
      daysOfWeek: null,
      minNights: null,
      priceOverride: null,
      priceAdjPct: null,
      minPriceOverride: null,
      maxPriceOverride: null,
      minStayOverride: null,
      isBlocked: true,
      closedToArrival: false,
      closedToDeparture: false,
      suspendLastMinute: false,
      suspendGapFill: false,
    };
    const res = computeDay(date, today, makeConfig(), [block], noBooking);
    expect(res.isAvailable).toBe(0);
  });

  it("always rounds price to 2 decimal places", () => {
    const res = computeDay(date, today, makeConfig({ basePrice: 333.333 }), [], noBooking);
    expect(res.price).toBe(Math.round(res.price * 100) / 100);
  });
});

describe("computeDay — Pass 0 market anchor", () => {
  it("de-anchors from listed price toward comp-set and pacing blend", () => {
    const signal: MarketSignal = { compSetP50: 620, pacingAdr: 600, monthAnchorAdr: 580 };
    const res = computeDay(date, today, makeConfig({ basePrice: 165 }), [], noBooking, signal);
    expect(res.price).toBeGreaterThan(400);
    expect(res.note).toContain("[MARKET] Anchor");
  });

  it("applies a supply discount when pressure is high and forward occupancy is weak", () => {
    const signal: MarketSignal = {
      supplyPressure: 0.5,
      forwardOccupancy: 0.5,
      activeListings: 12000,
      marketOccupancy: 0.5,
    };
    const res = computeDay(date, today, makeConfig({ basePrice: 500 }), [], noBooking, signal);
    expect(res.price).toBe(480);
    expect(res.note).toContain("[MARKET] Supply");
  });

  it("keeps aggressive market discounts inside the floor/ceiling band", () => {
    const signal: MarketSignal = {
      compSetP50: 480,
      monthAnchorAdr: 500,
      annualAnchorAdr: 520,
      forwardOccupancy: 0.2,
      supplyPressure: 0.6,
      pacingAdr: 450,
      activeListings: 15000,
    };
    const res = computeDay(date, today, makeConfig({ basePrice: 165 }), [], noBooking, signal);
    expect(res.price).toBeGreaterThanOrEqual(300);
    expect(res.price).toBeLessThanOrEqual(1200);
    expect(res.note).toContain("[MARKET]");
  });
});

describe("computeDay — booking recency", () => {
  const recencyConfig = {
    enabled: true,
    minDiscountPct: 5,
    maxDiscountPct: 15,
    minDaysSinceBooking: 15,
    maxDaysSinceBooking: 45,
    forwardDays: 30,
  };

  it("applies a recency discount within forwardDays lead time", () => {
    const nearDate = new Date("2026-06-20T00:00:00.000Z"); // 6 days out
    const res = computeDay(
      nearDate,
      today,
      makeConfig({
        bookingRecency: recencyConfig,
        daysSinceLastBooking: 30,
      }),
      [],
      noBooking
    );
    expect(res.price).toBe(450); // 10% off 500
    expect(res.note).toContain("[BOOKING_RECENCY]");
  });

  it("skips recency discount beyond forwardDays", () => {
    const res = computeDay(
      date,
      today,
      makeConfig({
        bookingRecency: recencyConfig,
        daysSinceLastBooking: 30,
      }),
      [],
      noBooking
    );
    expect(res.price).toBe(500);
    expect(res.note).not.toContain("[BOOKING_RECENCY]");
  });
});

describe("computeDay — crisis regime", () => {
  it("caps price at comp p25 on tier 4 crisis", () => {
    const signal: MarketSignal = { compSetP25: 420, compSetP50: 480 };
    const res = computeDay(
      date,
      today,
      makeConfig({ basePrice: 500, crisisTier: 4 }),
      [],
      noBooking,
      signal
    );
    expect(res.price).toBe(420);
    expect(res.note).toContain("[CRISIS T4]");
  });

  it("leaves price unchanged when crisis tier is 0", () => {
    const res = computeDay(
      date,
      today,
      makeConfig({ crisisTier: 0 }),
      [],
      noBooking
    );
    expect(res.price).toBe(500);
    expect(res.note).not.toContain("[CRISIS");
  });
});

import { describe, expect, it } from "vitest";
import {
  assessListingPriceSanity,
  computeTtmAdr,
  isFlatCalendar,
  isRoundPlaceholderPrice,
  resolvePipelineListedPrice,
} from "./listing-price-sanity";

describe("listing price sanity", () => {
  it("detects flat calendar", () => {
    expect(isFlatCalendar([100, 100, 100])).toBe(true);
    expect(isFlatCalendar([100, 120, 110])).toBe(false);
  });

  it("flags common round placeholder prices", () => {
    expect(isRoundPlaceholderPrice(100)).toBe(true);
    expect(isRoundPlaceholderPrice(847)).toBe(false);
  });

  it("computes TTM ADR from reservations", () => {
    const { adr, count } = computeTtmAdr([
      { totalPrice: 800, nights: 2 },
      { totalPrice: 1200, nights: 3 },
    ]);
    expect(count).toBe(2);
    expect(adr).toBe(400);
  });

  it("marks flat 100 AED as placeholder vs market p50 1050", () => {
    const result = assessListingPriceSanity({
      listedPrice: 100,
      calendarPrices: Array(30).fill(100),
      marketP50: 1050,
    });
    expect(result.isPlaceholder).toBe(true);
    expect(result.source).toBe("benchmark");
    expect(result.trustedBasePrice).toBe(1050);
    expect(result.pmsPriceTrusted).toBe(false);
    expect(result.flags).toContain("flat_calendar");
  });

  it("prefers history ADR over listed price when bookings exist", () => {
    const result = assessListingPriceSanity({
      listedPrice: 100,
      calendarPrices: [100, 100],
      ttmAdr: 820,
      ttmReservationCount: 12,
      marketP50: 1050,
    });
    expect(result.source).toBe("history_1y");
    expect(result.trustedBasePrice).toBe(820);
    expect(result.confidencePct).toBeGreaterThan(80);
  });

  it("trusts varied calendar close to market", () => {
    const result = assessListingPriceSanity({
      listedPrice: 980,
      calendarPrices: [950, 1000, 1020, 990, 1010],
      marketP50: 1000,
    });
    expect(result.pmsPriceTrusted).toBe(true);
    expect(result.isPlaceholder).toBe(false);
  });

  it("resolvePipelineListedPrice ignores flat wrong calendar when untrusted", () => {
    const map = new Map<string, number>();
    for (let i = 0; i < 10; i++) map.set(`2026-07-${String(i + 1).padStart(2, "0")}`, 100);

    const price = resolvePipelineListedPrice({
      date: "2026-07-05",
      calendarPriceByDate: map,
      listingFallbackPrice: 100,
      validatedBasePrice: 1050,
      pmsPriceTrusted: false,
    });
    expect(price).toBe(1050);
  });

  it("resolvePipelineListedPrice uses calendar when trusted", () => {
    const map = new Map([["2026-07-05", 980]]);
    const price = resolvePipelineListedPrice({
      date: "2026-07-05",
      calendarPriceByDate: map,
      listingFallbackPrice: 100,
      validatedBasePrice: 1050,
      pmsPriceTrusted: true,
    });
    expect(price).toBe(980);
  });
});
import { describe, expect, it } from "vitest";
import { resolveListingPriceContext } from "./display-rate";
import { assessPricingReadiness } from "./pricing-readiness";

function ctx(overrides: Partial<ReturnType<typeof resolveListingPriceContext>> = {}) {
  return {
    displayRate: 200,
    rateLabel: "Listed Rate" as const,
    listedPrice: 200,
    avgCalendarRate: 200,
    currentPrice: 200,
    pmsBasePrice: 200,
    pmsPriceTrusted: true,
    validatedBasePrice: null,
    pmsDiffersFromCalendar: false,
    ...overrides,
  };
}

describe("assessPricingReadiness", () => {
  it("blocks demo units", () => {
    const result = assessPricingReadiness({
      hostawayId: "demo-1",
      name: "Luxury 1BR",
      price: 200,
      priceFloor: 100,
      priceCeiling: 500,
      priceContext: ctx(),
      calendarPrices: Array(20).fill(200),
      hasMarketBenchmark: true,
    });
    expect(result.level).toBe("blocked");
    expect(result.canGenerateProposals).toBe(false);
    expect(result.issues.some((i) => i.code === "DEMO_UNIT")).toBe(true);
  });

  it("blocks when no calendar and no hostaway", () => {
    const result = assessPricingReadiness({
      hostawayId: "",
      name: "NH Featured 1BR",
      price: 9999,
      priceFloor: 6999,
      priceCeiling: 17998,
      priceContext: ctx({
        currentPrice: 0,
        pmsPriceTrusted: false,
        pmsBasePrice: 9999,
      }),
      calendarPrices: [],
    });
    expect(result.level).toBe("blocked");
    expect(result.issues.some((i) => i.code === "NO_CALENDAR_RATES")).toBe(true);
  });

  it("ready when calendar and benchmark exist with trusted rates", () => {
    const calendarPrices = Array.from({ length: 20 }, (_, i) => 195 + (i % 5));
    const result = assessPricingReadiness({
      hostawayId: "12345",
      name: "Marina 1BR",
      price: 210,
      priceFloor: 150,
      priceCeiling: 450,
      priceContext: ctx({ currentPrice: 205 }),
      calendarPrices,
      hasMarketBenchmark: true,
    });
    expect(result.level).toBe("ready");
    expect(result.canRecommendPrices).toBe(true);
  });

  it("blocks flat placeholder calendar without benchmark", () => {
    const result = assessPricingReadiness({
      hostawayId: "88801",
      name: "JLT 1BR",
      price: 9999,
      priceFloor: 6999,
      priceCeiling: 17998,
      priceContext: ctx({
        currentPrice: 9999,
        pmsBasePrice: 9999,
        pmsPriceTrusted: false,
      }),
      calendarPrices: Array(20).fill(9999),
      hasMarketBenchmark: false,
    });
    expect(result.level).toBe("blocked");
    expect(result.issues.some((i) => i.code === "FLAT_PLACEHOLDER_CALENDAR")).toBe(true);
  });

  it("blocks dummy listing names", () => {
    const result = assessPricingReadiness({
      hostawayId: "12345",
      name: "Test Listing - Marina",
      price: 200,
      priceFloor: 100,
      priceCeiling: 500,
      priceContext: ctx(),
      calendarPrices: Array(20).fill(200),
      hasMarketBenchmark: true,
    });
    expect(result.level).toBe("blocked");
    expect(result.issues.some((i) => i.code === "DUMMY_NAME")).toBe(true);
  });

  it("advisory when PMS base differs but calendar is trusted", () => {
    const result = assessPricingReadiness({
      hostawayId: "99901",
      name: "JBR 1BR",
      price: 9999,
      priceFloor: 6999,
      priceCeiling: 17998,
      priceContext: ctx({
        currentPrice: 201,
        pmsBasePrice: 9999,
        pmsPriceTrusted: false,
        pmsDiffersFromCalendar: true,
      }),
      calendarPrices: Array(30).fill(201),
      hasMarketBenchmark: true,
      guardrailsWereSanitized: true,
    });
    expect(result.level).toBe("advisory");
    expect(result.canGenerateProposals).toBe(true);
    expect(result.issues.some((i) => i.code === "PMS_METADATA_STALE")).toBe(true);
  });
});
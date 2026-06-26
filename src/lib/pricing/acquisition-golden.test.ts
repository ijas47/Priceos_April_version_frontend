import { describe, expect, it } from "vitest";
import { resolveListingPriceContext } from "./display-rate";
import { assessPricingReadiness } from "./pricing-readiness";
import { applyProposalGuardrails } from "./proposal-guardrails";

/**
 * Golden scenarios for acquisition demos (50–100 unit portfolios).
 * Mirrors real Hostaway placeholder metadata vs synced calendar rates.
 */
describe("acquisition golden fixtures", () => {
  const calendar201 = Array.from({ length: 30 }, (_, i) => 198 + (i % 4));

  it("live Dubai 1BR: stale PMS 9999 but calendar ~201 → advisory, proposals capped", () => {
    const priceContext = resolveListingPriceContext({
      listingPrice: 9999,
      calendarPrices: calendar201,
      calendarListedPrice: 201,
      pmsPriceTrusted: false,
    });

    const readiness = assessPricingReadiness({
      hostawayId: "48291",
      name: "NH Featured 1BR",
      price: 9999,
      priceFloor: 6999,
      priceCeiling: 17998,
      priceContext,
      calendarPrices: calendar201,
      hasMarketBenchmark: true,
      guardrailsWereSanitized: true,
    });

    expect(readiness.level).toBe("advisory");
    expect(readiness.canGenerateProposals).toBe(true);
    expect(readiness.trustedListedPrice).toBeGreaterThan(150);
    expect(readiness.trustedListedPrice).toBeLessThan(250);

    const guardrailed = applyProposalGuardrails({
      proposedPrice: 1400,
      currentPrice: priceContext.currentPrice,
    });
    expect(Math.abs(guardrailed.changePct)).toBeLessThanOrEqual(15);
    expect(guardrailed.proposedPrice).toBeLessThan(250);
  });

  it("demo unit must block — never quote acquisition prices", () => {
    const readiness = assessPricingReadiness({
      hostawayId: "demo-marina-1br",
      name: "Marina Demo",
      price: 200,
      priceFloor: 100,
      priceCeiling: 500,
      priceContext: resolveListingPriceContext({ listingPrice: 200, calendarPrices: calendar201 }),
      calendarPrices: calendar201,
      hasMarketBenchmark: true,
    });
    expect(readiness.level).toBe("blocked");
    expect(readiness.canRecommendPrices).toBe(false);
  });

  it("distressed July: engine must not approve huge increases", () => {
    const current = 201;
    const guardrailed = applyProposalGuardrails({
      proposedPrice: 1350,
      currentPrice: current,
    });
    expect(guardrailed.changePct).toBeLessThanOrEqual(15);
    expect(guardrailed.proposedPrice).toBeLessThanOrEqual(Math.round(current * 1.15 * 100) / 100);
  });
});
import { describe, expect, it } from "vitest";
import { applyEventUplift, resolveEventUpliftPct } from "./event-pricing";

describe("resolveEventUpliftPct", () => {
  it("returns zero when no events", () => {
    expect(resolveEventUpliftPct([], "low").upliftPct).toBe(0);
  });

  it("caps high-impact uplift by weight", () => {
    const result = resolveEventUpliftPct(
      [{ name: "GITEX", impactLevel: "high" }],
      "low"
    );
    expect(result.upliftPct).toBe(8);
  });
});

describe("applyEventUplift", () => {
  it("increases price for events", () => {
    const { price } = applyEventUplift(500, [{ name: "NYE", impactLevel: "high" }], "medium");
    expect(price).toBeGreaterThan(500);
  });
});
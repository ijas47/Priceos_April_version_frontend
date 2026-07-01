import { describe, expect, it } from "vitest";
import { resolveCompAnchoredBase } from "./comp-first-base";
import type { CompSetPercentiles } from "./market-anchor";

const studioComps: CompSetPercentiles = {
  p25: 380,
  p50: 450,
  p75: 520,
  count: 24,
  source: "airbtics_comps",
};

describe("resolveCompAnchoredBase", () => {
  it("uses comp p50 when 10k studio calendar disagrees with regional comps", () => {
    const result = resolveCompAnchoredBase({
      compPercentiles: studioComps,
      calendarPrices: Array(30).fill(9981),
      bedrooms: 0,
      area: "Dubai Marina",
    });
    expect(result.mode).toBe("comp_set");
    expect(result.trustedBase).toBe(450);
    expect(result.compFirst).toBe(true);
    expect(result.pmsPriceTrusted).toBe(false);
    expect(result.reason).toContain("24");
    expect(result.reason).toContain("450");
  });

  it("keeps calendar when comp set is too small", () => {
    const result = resolveCompAnchoredBase({
      compPercentiles: { p25: 400, p50: 450, p75: 500, count: 2, source: "benchmark_comps" },
      calendarPrices: [420, 430, 440],
      bedrooms: 0,
      area: "JBR",
    });
    expect(result.mode).toBe("calendar");
    expect(result.trustedBase).toBe(430);
    expect(result.compFirst).toBe(false);
  });

  it("prefers achieved ADR with enough booking history", () => {
    const result = resolveCompAnchoredBase({
      compPercentiles: studioComps,
      calendarPrices: [480, 490, 500],
      achievedAdr: 485,
      achievedBookingCount: 8,
      bedrooms: 0,
      area: "Downtown Dubai",
    });
    expect(result.mode).toBe("achieved_adr");
    expect(result.trustedBase).toBe(485);
  });
});
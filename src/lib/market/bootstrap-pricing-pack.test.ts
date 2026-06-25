import { describe, expect, it } from "vitest";
import { blendSeasonalPatterns, patternsFromAirbticsMetrics } from "./bootstrap-pricing-pack";
import { MARKET_TEMPLATES_SEED } from "@/lib/db/seed/market-templates";

describe("bootstrap pricing pack helpers", () => {
  it("builds patterns from Airbtics monthly metrics", () => {
    const patterns = patternsFromAirbticsMetrics([
      { month: "2025-01", p50_adr: 80, occupancy: 55 },
      { month: "2025-02", p50_adr: 85, occupancy: 58 },
      { month: "2025-03", p50_adr: 90, occupancy: 60 },
      { month: "2025-04", p50_adr: 110, occupancy: 72 },
      { month: "2025-05", p50_adr: 130, occupancy: 80 },
      { month: "2025-06", p50_adr: 150, occupancy: 88 },
      { month: "2025-07", p50_adr: 160, occupancy: 92 },
      { month: "2025-08", p50_adr: 155, occupancy: 90 },
    ]);

    expect(patterns).not.toBeNull();
    expect(patterns!.find((p) => p.month === 7)?.ratePremiumPct).toBeGreaterThan(10);
    expect(patterns!.find((p) => p.month === 1)?.ratePremiumPct).toBeLessThan(0);
  });

  it("blends template with Airbtics toward signal", () => {
    const template = MARKET_TEMPLATES_SEED.find((m) => m.marketCode === "ESP_BCN")!.seasonalPatterns;
    const airbtics = patternsFromAirbticsMetrics([
      { month: "2025-06", p50_adr: 200 },
      { month: "2025-07", p50_adr: 220 },
      { month: "2025-01", p50_adr: 90 },
      { month: "2025-02", p50_adr: 95 },
      { month: "2025-03", p50_adr: 100 },
      { month: "2025-04", p50_adr: 120 },
      { month: "2025-05", p50_adr: 140 },
      { month: "2025-08", p50_adr: 210 },
    ])!;

    const blended = blendSeasonalPatterns(template, airbtics);
    const july = blended.find((p) => p.month === 7)!;
    expect(july.ratePremiumPct).toBeGreaterThan(20);
  });
});
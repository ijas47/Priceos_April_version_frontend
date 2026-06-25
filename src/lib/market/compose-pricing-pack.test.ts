import { describe, expect, it } from "vitest";
import { MARKET_TEMPLATES_SEED } from "@/lib/db/seed/market-templates";
import { buildSeasonalSegments, composePricingPackFromTemplate } from "./compose-pricing-pack";

describe("composePricingPackFromTemplate", () => {
  it("builds Barcelona pack with summer peak segment", () => {
    const template = MARKET_TEMPLATES_SEED.find((m) => m.marketCode === "ESP_BCN")!;
    const pack = composePricingPackFromTemplate(template);

    expect(pack.marketCode).toBe("ESP_BCN");
    expect(pack.pricingProfiles.length).toBeGreaterThanOrEqual(3);
    expect(pack.seasonalCalendars[0].segments.length).toBeGreaterThan(0);

    const summerSegment = pack.seasonalCalendars[0].segments.find((s) => s.name === "Peak");
    expect(summerSegment?.pricingProfileId).toBe("high_season");
  });

  it("preserves UAE hand-tuned pack separately", () => {
    const template = MARKET_TEMPLATES_SEED.find((m) => m.marketCode === "UAE_DXB")!;
    const pack = composePricingPackFromTemplate(template);
    expect(pack.marketCode).toBe("UAE_DXB");
    expect(pack.version).toContain("template");
  });

  it("merges consecutive months in same band", () => {
    const template = MARKET_TEMPLATES_SEED.find((m) => m.marketCode === "ITA_MIL")!;
    const segments = buildSeasonalSegments(template.seasonalPatterns);
    const augustLow = segments.find((s) => s.startMd <= "08-01" && s.endMd >= "08-31");
    expect(augustLow?.pricingProfileId).toBe("low_season_summer");
  });
});
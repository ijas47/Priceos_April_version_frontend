import { describe, expect, it } from "vitest";
import {
  applyStrategyPresetToConfig,
  resolveMonthlyGuardrailBand,
} from "./strategy-runtime";
import { resolveStrategyPreset } from "./strategy-presets";
import type { ListingConfig } from "@/lib/engine/waterfall";

function baseConfig(): ListingConfig {
  return {
    basePrice: 500,
    absoluteMinPrice: 200,
    absoluteMaxPrice: 2000,
    defaultMinStay: 1,
    defaultMaxStay: 30,
    lowestMinStayAllowed: 1,
    allowedCheckinDays: [1, 1, 1, 1, 1, 1, 1],
    allowedCheckoutDays: [1, 1, 1, 1, 1, 1, 1],
    lastMinuteEnabled: false,
    lastMinuteDaysOut: 7,
    lastMinuteDiscountPct: 10,
    lastMinuteMinStay: null,
    farOutEnabled: false,
    farOutDaysOut: 90,
    farOutMarkupPct: 5,
    farOutMinStay: null,
    dowPricingEnabled: true,
    dowDays: [4, 5],
    dowPriceAdjPct: 5,
    dowMinStay: null,
    gapPreventionEnabled: false,
    minFragmentThreshold: 2,
    gapFillEnabled: false,
    gapFillLengthMin: 1,
    gapFillLengthMax: 3,
    gapFillDiscountPct: 8,
    gapFillOverrideCico: false,
  };
}

describe("applyStrategyPresetToConfig", () => {
  it("applies aggressive last-minute discount on each run", () => {
    const out = applyStrategyPresetToConfig(baseConfig(), "aggressive");
    expect(out.lastMinuteDiscountPct).toBe(25);
    expect(out.lastMinuteEnabled).toBe(true);
  });
});

describe("resolveMonthlyGuardrailBand", () => {
  it("widens band using month market percentiles", () => {
    const preset = resolveStrategyPreset("balanced");
    const band = resolveMonthlyGuardrailBand({
      staticFloor: 100,
      staticCeiling: 900,
      monthP25: 200,
      monthP75: 800,
      preset,
    });
    expect(band.floor).toBeGreaterThanOrEqual(100);
    expect(band.ceiling).toBeGreaterThan(900);
    expect(band.note).toContain("[BAND]");
  });
});
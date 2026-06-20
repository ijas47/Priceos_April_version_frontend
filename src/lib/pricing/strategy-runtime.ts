import type { ListingConfig } from "@/lib/engine/waterfall";
import {
  type Strategy,
  type StrategyPreset,
  resolveStrategyPreset,
} from "@/lib/pricing/strategy-presets";

/**
 * Re-apply portfolio strategy knobs on every engine run (in-memory only).
 * Strategy presets tune tactical aggression; they do not replace market anchors.
 */
export function applyStrategyPresetToConfig(
  config: ListingConfig,
  strategy: Strategy | null | undefined,
  overrides?: Partial<StrategyPreset>
): ListingConfig {
  const preset = resolveStrategyPreset(strategy ?? "balanced", overrides);
  return {
    ...config,
    lastMinuteEnabled: true,
    lastMinuteDaysOut: preset.lastMinuteDaysOut,
    lastMinuteDiscountPct: preset.lastMinuteDiscountPct,
    farOutEnabled: true,
    farOutDaysOut: preset.farOutDaysOut,
    farOutMarkupPct: preset.farOutMarkupPct,
    gapFillEnabled: true,
    gapFillDiscountPct: preset.gapFillDiscountPct,
    dowPricingEnabled: config.dowPricingEnabled,
    dowPriceAdjPct: config.dowPricingEnabled ? preset.dowUpliftPct : config.dowPriceAdjPct,
  };
}

export interface MonthlyGuardrailBand {
  floor: number;
  ceiling: number;
  note: string | null;
}

/**
 * Month-specific floor/ceiling from market percentiles × strategy multipliers.
 * Enables Dubai-style seasonal bands (summer p25 vs winter p75).
 */
export function resolveMonthlyGuardrailBand(args: {
  staticFloor: number;
  staticCeiling: number;
  monthP25?: number | null;
  monthP75?: number | null;
  monthP50?: number | null;
  preset: StrategyPreset;
}): MonthlyGuardrailBand {
  const { staticFloor, staticCeiling, preset } = args;
  const p25 = args.monthP25 ?? args.monthP50;
  const p75 = args.monthP75 ?? args.monthP50;

  if (!p25 || !p75 || p25 <= 0 || p75 <= 0) {
    return { floor: staticFloor, ceiling: staticCeiling, note: null };
  }

  const marketFloor = Math.round(p25 * preset.floorMult);
  const marketCeiling = Math.round(p75 * preset.ceilingMult);
  const floor = Math.max(staticFloor, marketFloor);
  const ceiling = Math.max(floor + 1, Math.max(staticCeiling, marketCeiling));

  return {
    floor,
    ceiling,
    note: `[BAND] Month market p25→${marketFloor} p75→${marketCeiling} (${preset.floorMult}×/${preset.ceilingMult}×)`,
  };
}
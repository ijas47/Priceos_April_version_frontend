/**
 * Portfolio strategy presets shared by Settings UI and auto-setup engine.
 */

export type Strategy = "conservative" | "balanced" | "aggressive";

export interface StrategyPreset {
  floorMult: number;
  ceilingMult: number;
  lastMinuteDiscountPct: number;
  lastMinuteDaysOut: number;
  farOutMarkupPct: number;
  farOutDaysOut: number;
  dowUpliftPct: number;
  gapFillDiscountPct: number;
  autoApproveThreshold: number;
  maxSingleDayChangePct: number;
}

export const STRATEGY_PRESETS: Record<Strategy, StrategyPreset> = {
  conservative: {
    floorMult: 0.7,
    ceilingMult: 1.8,
    lastMinuteDiscountPct: 10,
    lastMinuteDaysOut: 5,
    farOutMarkupPct: 5,
    farOutDaysOut: 120,
    dowUpliftPct: 10,
    gapFillDiscountPct: 8,
    autoApproveThreshold: 3,
    maxSingleDayChangePct: 10,
  },
  balanced: {
    floorMult: 0.5,
    ceilingMult: 2.5,
    lastMinuteDiscountPct: 15,
    lastMinuteDaysOut: 7,
    farOutMarkupPct: 10,
    farOutDaysOut: 90,
    dowUpliftPct: 15,
    gapFillDiscountPct: 12,
    autoApproveThreshold: 5,
    maxSingleDayChangePct: 15,
  },
  aggressive: {
    floorMult: 0.4,
    ceilingMult: 3.5,
    lastMinuteDiscountPct: 25,
    lastMinuteDaysOut: 10,
    farOutMarkupPct: 20,
    farOutDaysOut: 60,
    dowUpliftPct: 25,
    gapFillDiscountPct: 18,
    autoApproveThreshold: 10,
    maxSingleDayChangePct: 25,
  },
};

export function resolveStrategyPreset(
  strategy: Strategy,
  overrides?: Partial<StrategyPreset>
): StrategyPreset {
  return { ...STRATEGY_PRESETS[strategy], ...overrides };
}

export function portfolioGuardrailsFromStrategy(
  strategy: Strategy,
  overrides?: Partial<StrategyPreset>
): {
  maxSingleDayChangePct: number;
  autoApproveThreshold: number;
  absoluteFloorMultiplier: number;
  absoluteCeilingMultiplier: number;
} {
  const preset = resolveStrategyPreset(strategy, overrides);
  return {
    maxSingleDayChangePct: preset.maxSingleDayChangePct,
    autoApproveThreshold: preset.autoApproveThreshold,
    absoluteFloorMultiplier: preset.floorMult,
    absoluteCeilingMultiplier: preset.ceilingMult,
  };
}

export const STRATEGY_PRESET_FIELDS: {
  key: keyof StrategyPreset;
  label: string;
  unit: "%" | "days" | "×";
  step?: number;
  min?: number;
  max?: number;
}[] = [
  { key: "floorMult", label: "Floor multiplier", unit: "×", step: 0.05, min: 0.1, max: 1 },
  { key: "ceilingMult", label: "Ceiling multiplier", unit: "×", step: 0.1, min: 1, max: 5 },
  { key: "maxSingleDayChangePct", label: "Max daily price change", unit: "%", step: 1, min: 1, max: 50 },
  { key: "autoApproveThreshold", label: "Auto-approve under", unit: "%", step: 1, min: 1, max: 25 },
  { key: "lastMinuteDiscountPct", label: "Last-minute discount", unit: "%", step: 1, min: 0, max: 50 },
  { key: "lastMinuteDaysOut", label: "Last-minute window", unit: "days", step: 1, min: 1, max: 30 },
  { key: "farOutMarkupPct", label: "Far-out markup", unit: "%", step: 1, min: 0, max: 50 },
  { key: "farOutDaysOut", label: "Far-out window", unit: "days", step: 5, min: 30, max: 180 },
  { key: "dowUpliftPct", label: "Weekend uplift", unit: "%", step: 1, min: 0, max: 50 },
  { key: "gapFillDiscountPct", label: "Gap-fill discount", unit: "%", step: 1, min: 0, max: 30 },
];
import type { SafetyMinimumPriceConfig } from "./types";

export interface DynamicFloorInput {
  staticFloor: number;
  leadTimeDays: number;
  stlyRate: number | null;
  safetyConfig?: SafetyMinimumPriceConfig | null;
  /** Market comp p25 - soft near-term floor guard */
  compSetP25?: number | null;
  /** Apply comp p25 guard within this lead time (days). 0 = disabled. */
  nearTermCompGuardDays?: number;
  nearTermCompFloorPct?: number;
  /** When true, skip comp p25 near-term floor lift (distressed / soft demand). */
  suspendCompFloorGuard?: boolean;
}

export interface DynamicFloorResult {
  /** Effective floor = max(static, dynamic signals). */
  floor: number;
  staticFloor: number;
  stlySafetyFloor: number | null;
  compGuardFloor: number | null;
  note: string | null;
}

/**
 * Per-day effective minimum price.
 * Wires PriceLabs `safetyMinimumPrice` (STLY × multiplier, far-out only)
 * and an optional near-term comp p25 guard.
 */
export function resolveDynamicFloor(input: DynamicFloorInput): DynamicFloorResult {
  const {
    staticFloor,
    leadTimeDays,
    stlyRate,
    safetyConfig,
    compSetP25,
    nearTermCompGuardDays = 90,
    nearTermCompFloorPct = 0.85,
  } = input;

  const notes: string[] = [];
  let stlySafetyFloor: number | null = null;
  let compGuardFloor: number | null = null;

  if (
    safetyConfig?.enabled &&
    leadTimeDays >= safetyConfig.beyondDaysOut &&
    stlyRate != null &&
    stlyRate > 0
  ) {
    stlySafetyFloor = Math.round(stlyRate * safetyConfig.adrMultiplier);
    notes.push(
      `[FLOOR] STLY safety min ${stlySafetyFloor} (${safetyConfig.adrMultiplier}× LY ${Math.round(stlyRate)}, ≥${safetyConfig.beyondDaysOut}d out)`
    );
  }

  if (
    !input.suspendCompFloorGuard &&
    compSetP25 != null &&
    compSetP25 > 0 &&
    nearTermCompGuardDays > 0 &&
    leadTimeDays <= nearTermCompGuardDays
  ) {
    compGuardFloor = Math.round(compSetP25 * nearTermCompFloorPct);
    notes.push(
      `[FLOOR] Comp p25 guard ${compGuardFloor} (${Math.round(nearTermCompFloorPct * 100)}% of mkt p25 ${Math.round(compSetP25)})`
    );
  }

  const dynamicCandidates = [stlySafetyFloor, compGuardFloor].filter(
    (v): v is number => v != null && v > 0
  );
  const dynamicMax = dynamicCandidates.length > 0 ? Math.max(...dynamicCandidates) : 0;
  const floor = Math.max(staticFloor, dynamicMax);

  if (floor > staticFloor && notes.length === 0) {
    notes.push(`[FLOOR] Raised to ${floor} (static ${staticFloor})`);
  }

  return {
    floor,
    staticFloor,
    stlySafetyFloor,
    compGuardFloor,
    note: notes.length > 0 ? notes.join("; ") : null,
  };
}
/**
 * Portfolio-wide percentage price adjustments (PriceLabs-style tactical shifts).
 */

export type BulkAdjustMode = "proposals" | "calendar";

export interface ListingGuardrails {
  priceFloor: number;
  priceCeiling: number;
}

export function clampAdjustedPrice(
  basePrice: number,
  adjPct: number,
  guardrails: ListingGuardrails
): number {
  const raw = basePrice * (1 + adjPct / 100);
  let price = Math.round(raw);
  const floor = guardrails.priceFloor;
  const ceiling = guardrails.priceCeiling;
  if (floor > 0 && price < floor) price = floor;
  if (ceiling > 0 && price > ceiling) price = ceiling;
  return price;
}

export function changePctFromPrices(current: number, proposed: number): number | null {
  if (current <= 0) return null;
  return Math.round(((proposed - current) / current) * 100);
}

export function validateBulkAdjustInput(input: {
  adjPct: number;
  startDate: string;
  endDate: string;
  mode?: string;
}): string | null {
  if (!Number.isFinite(input.adjPct)) return "adjPct must be a number";
  if (input.adjPct < -50 || input.adjPct > 50) {
    return "adjPct must be between -50 and +50";
  }
  if (input.adjPct === 0) return "adjPct cannot be 0";
  if (!input.startDate || !input.endDate) return "startDate and endDate are required";
  if (input.startDate > input.endDate) return "startDate must be on or before endDate";
  if (input.mode && input.mode !== "proposals" && input.mode !== "calendar") {
    return "mode must be proposals or calendar";
  }
  return null;
}

export function bulkAdjustReasoning(adjPct: number): string {
  const sign = adjPct > 0 ? "+" : "";
  return `Portfolio bulk adjust ${sign}${adjPct}% (manual tactical shift)`;
}
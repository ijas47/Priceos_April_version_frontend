/**
 * Blend listing, area, and market occupancy for PriceLabs-style occ-matrix input.
 * Listing weight fades when history is thin (cold start).
 */

export interface OccupancyBlendInput {
  /** Listing rolling occupancy 0–100. */
  listingOccPct: number;
  /** Area/market occupancy 0–100 (from Dubai monthly or Airbtics). */
  marketOccPct?: number | null;
  /** Days of inventory history used for listing occ. */
  listingHistoryDays: number;
  /** Minimum days before listing occ is trusted. */
  minListingHistoryDays?: number;
}

export const OCCUPANCY_BLEND_WEIGHTS = {
  market: 0.5,
  listing: 0.3,
  /** Implicit remainder goes to neutral 50% prior. */
  neutral: 0.2,
} as const;

/**
 * Returns blended occupancy 0–100 for occupancy × lead-time matrix lookups.
 */
export function resolveBlendedOccupancyPct(input: OccupancyBlendInput): number {
  const minDays = input.minListingHistoryDays ?? 14;
  const market = input.marketOccPct;

  let listingWeight = OCCUPANCY_BLEND_WEIGHTS.listing;
  if (input.listingHistoryDays < minDays) {
    const t = Math.max(0, input.listingHistoryDays / minDays);
    listingWeight *= t;
  }

  const marketWeight =
    market != null && market >= 0 ? OCCUPANCY_BLEND_WEIGHTS.market : 0;
  const neutralWeight = Math.max(
    0,
    1 - listingWeight - marketWeight
  );

  const marketVal = market ?? 50;
  const blended =
    listingWeight * input.listingOccPct +
    marketWeight * marketVal +
    neutralWeight * 50;

  return Math.round(Math.max(0, Math.min(100, blended)));
}

/** Normalize occupancy from 0–1 fraction or 0–100 percent. */
export function occupancyToPct(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (value <= 1) return Math.round(value * 100);
  return Math.round(value);
}
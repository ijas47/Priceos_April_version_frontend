/**
 * Resolve bedroom count for market/comp queries.
 * Studios are stored as 0 — never use `bedroomsNumber || 1` (0 is falsy in JS).
 */
export function resolveBedroomsNumber(
  bedrooms: number | null | undefined,
  fallback = 1
): number {
  if (bedrooms == null || Number.isNaN(Number(bedrooms))) return fallback;
  return Math.max(0, Math.round(Number(bedrooms)));
}

export function bedroomsLabel(bedrooms: number): string {
  return bedrooms === 0 ? "Studio (0BR)" : `${bedrooms}BR`;
}
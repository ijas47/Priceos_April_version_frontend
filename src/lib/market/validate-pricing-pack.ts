import type { MarketPricingPack } from "@/lib/pricing/types";

export function validatePricingPack(pack: MarketPricingPack): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!pack.marketCode) errors.push("marketCode is required");
  if (!pack.version) errors.push("version is required");
  if (!Array.isArray(pack.pricingProfiles) || pack.pricingProfiles.length === 0) {
    errors.push("pricingProfiles must be non-empty");
  }
  if (!Array.isArray(pack.seasonalCalendars) || pack.seasonalCalendars.length === 0) {
    errors.push("seasonalCalendars must be non-empty");
  }
  if (!pack.portfolioDefaults?.defaultSeasonalCalendarId) {
    errors.push("portfolioDefaults.defaultSeasonalCalendarId is required");
  }

  const calendar = pack.seasonalCalendars.find(
    (c) => c.id === pack.portfolioDefaults.defaultSeasonalCalendarId
  );
  if (!calendar || calendar.segments.length === 0) {
    errors.push("default seasonal calendar must have segments");
  }

  for (const profile of pack.pricingProfiles) {
    if (!profile.id || !profile.occupancyMatrix?.rows?.length) {
      errors.push(`profile ${profile.id || "?"} missing occupancy matrix`);
    }
  }

  return { valid: errors.length === 0, errors };
}
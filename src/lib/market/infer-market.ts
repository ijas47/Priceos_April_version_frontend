import {
  getMarketEntry,
  normalizeCity,
  resolveMarketCodeFromLocation,
  type MarketRegistryEntry,
} from "./market-registry";

export interface ListingLocationInput {
  city?: string;
  countryCode?: string;
  area?: string;
}

export type MarketInferenceConfidence = "high" | "medium" | "low";

export interface InferredMarket {
  marketCode: string;
  displayName: string;
  city: string;
  country: string;
  currency: string;
  flag: string;
  confidence: MarketInferenceConfidence;
  /** Informational — large multi-city operators are out of scope; we still pick the majority city */
  multiCityDetected: boolean;
  primaryShare: number;
  matchedEntry: MarketRegistryEntry;
}

const DEFAULT_MARKET_CODE = "UAE_DXB";

function pickPrimaryCity(listings: ListingLocationInput[]): { city: string; countryCode: string; share: number; multiCity: boolean } {
  const counts = new Map<string, { city: string; countryCode: string; n: number }>();

  for (const l of listings) {
    const city = normalizeCity(l.city || l.area || "");
    if (!city) continue;
    const key = `${city}|${(l.countryCode || "").toUpperCase()}`;
    const prev = counts.get(key);
    if (prev) prev.n += 1;
    else counts.set(key, { city: l.city || l.area || city, countryCode: l.countryCode || "", n: 1 });
  }

  if (counts.size === 0) {
    return { city: "", countryCode: "", share: 0, multiCity: false };
  }

  const sorted = [...counts.values()].sort((a, b) => b.n - a.n);
  const total = listings.filter((l) => normalizeCity(l.city || l.area || "")).length || listings.length;
  const top = sorted[0];
  const share = total > 0 ? top.n / total : 0;
  const secondShare = sorted.length > 1 ? sorted[1].n / total : 0;

  return {
    city: top.city,
    countryCode: top.countryCode,
    share,
    multiCity: secondShare >= 0.15,
  };
}

/**
 * Infer a single operating market from listing locations.
 * Optimized for single-city portfolios (majority city wins).
 */
export function inferMarketFromListings(
  listings: ListingLocationInput[],
  fallbackMarketCode: string = DEFAULT_MARKET_CODE
): InferredMarket {
  const { city, countryCode, share, multiCity } = pickPrimaryCity(listings);

  let entry = city ? resolveMarketCodeFromLocation(city, countryCode) : null;
  if (!entry) {
    entry = getMarketEntry(fallbackMarketCode) ?? getMarketEntry(DEFAULT_MARKET_CODE)!;
  }

  let confidence: MarketInferenceConfidence = "low";
  if (share >= 0.8 && city) confidence = "high";
  else if (share >= 0.55 && city) confidence = "medium";

  return {
    marketCode: entry.marketCode,
    displayName: entry.displayName,
    city: city || entry.displayName.split(",")[0],
    country: entry.country,
    currency: entry.currency,
    flag: entry.flag,
    confidence,
    multiCityDetected: multiCity,
    primaryShare: share,
    matchedEntry: entry,
  };
}
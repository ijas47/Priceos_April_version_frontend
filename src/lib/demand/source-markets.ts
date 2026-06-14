/**
 * Source Market Definitions
 *
 * Each destination market has a set of tourist source markets that drive
 * demand. These definitions encode baseline weights, seasonal peaks, booking
 * behavior, and price sensitivity for each origin market.
 *
 * The system is geography-agnostic: register a profile per destination market
 * in SOURCE_MARKET_REGISTRY. Unknown markets resolve to a neutral (no-bias)
 * demand modifier rather than borrowing another market's profile.
 */

export interface SourceMarket {
  /** Unique short code (ISO 3166-1 alpha-2 where applicable) */
  id: string;
  /** Human-readable market name */
  name: string;
  /** Geographic region grouping */
  region: string;
  /** Proportion of total demand from this market (0-1, all markets sum to ~1) */
  baseWeight: number;
  /** Calendar months (1-12) when this source market peaks in the destination */
  seasonalPeaks: number[];
  /** Average days between booking and check-in */
  avgBookingLeadDays: number;
  /** Average length of stay in nights */
  avgLOS: number;
  /** Price elasticity of demand (-1 to 0); more negative = more price sensitive */
  priceElasticity: number;
  /** Source market's home currency code */
  currency: string;
  /** How much exchange rate fluctuations affect booking decisions */
  exchangeRateImpact: "high" | "medium" | "low";
}

// ---------------------------------------------------------------------------
// Dubai source markets
// ---------------------------------------------------------------------------

export const DUBAI_SOURCE_MARKETS: SourceMarket[] = [
  {
    id: "uk",
    name: "United Kingdom",
    region: "europe",
    baseWeight: 0.18,
    seasonalPeaks: [12, 1, 2, 10, 11],
    avgBookingLeadDays: 45,
    avgLOS: 5,
    priceElasticity: -0.4,
    currency: "GBP",
    exchangeRateImpact: "medium",
  },
  {
    id: "ru",
    name: "Russia & CIS",
    region: "europe",
    baseWeight: 0.14,
    seasonalPeaks: [12, 1, 2, 3],
    avgBookingLeadDays: 30,
    avgLOS: 7,
    priceElasticity: -0.3,
    currency: "RUB",
    exchangeRateImpact: "high",
  },
  {
    id: "in",
    name: "India",
    region: "asia",
    baseWeight: 0.12,
    seasonalPeaks: [12, 1, 4, 5, 6],
    avgBookingLeadDays: 20,
    avgLOS: 4,
    priceElasticity: -0.6,
    currency: "INR",
    exchangeRateImpact: "high",
  },
  {
    id: "de",
    name: "Germany",
    region: "europe",
    baseWeight: 0.08,
    seasonalPeaks: [12, 1, 2, 10],
    avgBookingLeadDays: 60,
    avgLOS: 6,
    priceElasticity: -0.35,
    currency: "EUR",
    exchangeRateImpact: "low",
  },
  {
    id: "cn",
    name: "China",
    region: "asia",
    baseWeight: 0.07,
    seasonalPeaks: [1, 2, 10],
    avgBookingLeadDays: 25,
    avgLOS: 5,
    priceElasticity: -0.5,
    currency: "CNY",
    exchangeRateImpact: "medium",
  },
  {
    id: "us",
    name: "United States",
    region: "americas",
    baseWeight: 0.06,
    seasonalPeaks: [12, 1, 3, 11],
    avgBookingLeadDays: 50,
    avgLOS: 5,
    priceElasticity: -0.3,
    currency: "USD",
    exchangeRateImpact: "low",
  },
  {
    id: "sa",
    name: "Saudi Arabia",
    region: "gcc",
    baseWeight: 0.1,
    seasonalPeaks: [6, 7, 8, 12],
    avgBookingLeadDays: 14,
    avgLOS: 3,
    priceElasticity: -0.25,
    currency: "SAR",
    exchangeRateImpact: "low",
  },
  {
    id: "gcc_other",
    name: "Other GCC",
    region: "gcc",
    baseWeight: 0.08,
    seasonalPeaks: [6, 7, 8, 12],
    avgBookingLeadDays: 10,
    avgLOS: 3,
    priceElasticity: -0.2,
    currency: "AED",
    exchangeRateImpact: "low",
  },
  {
    id: "other",
    name: "Rest of World",
    region: "other",
    baseWeight: 0.17,
    seasonalPeaks: [12, 1, 2],
    avgBookingLeadDays: 35,
    avgLOS: 5,
    priceElasticity: -0.4,
    currency: "USD",
    exchangeRateImpact: "medium",
  },
];

// ---------------------------------------------------------------------------
// London source markets
// ---------------------------------------------------------------------------

export const LONDON_SOURCE_MARKETS: SourceMarket[] = [
  {
    id: "us",
    name: "United States",
    region: "americas",
    baseWeight: 0.2,
    seasonalPeaks: [6, 7, 8, 12],
    avgBookingLeadDays: 55,
    avgLOS: 5,
    priceElasticity: -0.35,
    currency: "USD",
    exchangeRateImpact: "medium",
  },
  {
    id: "fr",
    name: "France",
    region: "europe",
    baseWeight: 0.12,
    seasonalPeaks: [6, 7, 8, 12],
    avgBookingLeadDays: 30,
    avgLOS: 3,
    priceElasticity: -0.4,
    currency: "EUR",
    exchangeRateImpact: "low",
  },
  {
    id: "de",
    name: "Germany",
    region: "europe",
    baseWeight: 0.1,
    seasonalPeaks: [6, 7, 8, 12],
    avgBookingLeadDays: 50,
    avgLOS: 4,
    priceElasticity: -0.35,
    currency: "EUR",
    exchangeRateImpact: "low",
  },
  {
    id: "ae",
    name: "UAE & Gulf",
    region: "gcc",
    baseWeight: 0.08,
    seasonalPeaks: [6, 7, 8],
    avgBookingLeadDays: 20,
    avgLOS: 6,
    priceElasticity: -0.2,
    currency: "AED",
    exchangeRateImpact: "medium",
  },
  {
    id: "cn",
    name: "China",
    region: "asia",
    baseWeight: 0.07,
    seasonalPeaks: [1, 2, 7, 8, 10],
    avgBookingLeadDays: 30,
    avgLOS: 5,
    priceElasticity: -0.5,
    currency: "CNY",
    exchangeRateImpact: "high",
  },
  {
    id: "au",
    name: "Australia",
    region: "oceania",
    baseWeight: 0.06,
    seasonalPeaks: [6, 7, 8, 12],
    avgBookingLeadDays: 60,
    avgLOS: 7,
    priceElasticity: -0.3,
    currency: "AUD",
    exchangeRateImpact: "medium",
  },
  {
    id: "it",
    name: "Italy",
    region: "europe",
    baseWeight: 0.06,
    seasonalPeaks: [6, 7, 8],
    avgBookingLeadDays: 35,
    avgLOS: 4,
    priceElasticity: -0.45,
    currency: "EUR",
    exchangeRateImpact: "low",
  },
  {
    id: "es",
    name: "Spain",
    region: "europe",
    baseWeight: 0.05,
    seasonalPeaks: [6, 7, 8, 12],
    avgBookingLeadDays: 30,
    avgLOS: 4,
    priceElasticity: -0.45,
    currency: "EUR",
    exchangeRateImpact: "low",
  },
  {
    id: "other",
    name: "Rest of World",
    region: "other",
    baseWeight: 0.26,
    seasonalPeaks: [6, 7, 8, 12],
    avgBookingLeadDays: 40,
    avgLOS: 5,
    priceElasticity: -0.4,
    currency: "USD",
    exchangeRateImpact: "medium",
  },
];

// ---------------------------------------------------------------------------
// Registry — look up source markets by destination template key
// ---------------------------------------------------------------------------

export const SOURCE_MARKET_REGISTRY: Record<string, SourceMarket[]> = {
  dubai: DUBAI_SOURCE_MARKETS,
  london: LONDON_SOURCE_MARKETS,
};

/**
 * Look up the source-market list for a destination. Returns an empty list for
 * unknown markets (callers treat that as a neutral, no-bias demand modifier) —
 * the product is not tied to any single geography.
 */
export function getSourceMarkets(marketTemplate: string): SourceMarket[] {
  return SOURCE_MARKET_REGISTRY[(marketTemplate || "").toLowerCase()] ?? [];
}

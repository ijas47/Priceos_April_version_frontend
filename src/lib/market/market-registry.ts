/**
 * Static registry of supported operating markets.
 * City aliases map Hostaway listing locations → marketCode (single-city PMs).
 */

export interface MarketRegistryEntry {
  marketCode: string;
  displayName: string;
  country: string;
  currency: string;
  flag: string;
  /** Guardrail default from MarketTemplate seed */
  maxChangePct: number;
  weekend: string;
  /** Normalized city aliases (lowercase) */
  cityAliases: string[];
  /** ISO 3166-1 alpha-2 codes */
  countryCodes: string[];
}

export const MARKET_REGISTRY: MarketRegistryEntry[] = [
  {
    marketCode: "UAE_DXB",
    displayName: "Dubai, UAE",
    country: "United Arab Emirates",
    currency: "AED",
    flag: "🇦🇪",
    maxChangePct: 15,
    weekend: "Thu–Fri",
    cityAliases: ["dubai", "abu dhabi", "sharjah", "ajman", "ras al khaimah", "fujairah", "al ain"],
    countryCodes: ["AE", "UAE"],
  },
  {
    marketCode: "GBR_LON",
    displayName: "London, UK",
    country: "United Kingdom",
    currency: "GBP",
    flag: "🇬🇧",
    maxChangePct: 10,
    weekend: "Fri–Sat",
    cityAliases: ["london", "westminster", "camden", "shoreditch", "greenwich"],
    countryCodes: ["GB", "UK"],
  },
  {
    marketCode: "USA_NYC",
    displayName: "New York, USA",
    country: "United States",
    currency: "USD",
    flag: "🇺🇸",
    maxChangePct: 12,
    weekend: "Fri–Sat",
    cityAliases: ["new york", "new york city", "nyc", "manhattan", "brooklyn", "queens"],
    countryCodes: ["US"],
  },
  {
    marketCode: "FRA_PAR",
    displayName: "Paris, France",
    country: "France",
    currency: "EUR",
    flag: "🇫🇷",
    maxChangePct: 10,
    weekend: "Fri–Sat",
    cityAliases: ["paris"],
    countryCodes: ["FR"],
  },
  {
    marketCode: "NLD_AMS",
    displayName: "Amsterdam, Netherlands",
    country: "Netherlands",
    currency: "EUR",
    flag: "🇳🇱",
    maxChangePct: 10,
    weekend: "Fri–Sat",
    cityAliases: ["amsterdam"],
    countryCodes: ["NL"],
  },
  {
    marketCode: "ESP_BCN",
    displayName: "Barcelona, Spain",
    country: "Spain",
    currency: "EUR",
    flag: "🇪🇸",
    maxChangePct: 12,
    weekend: "Fri–Sat",
    cityAliases: ["barcelona"],
    countryCodes: ["ES"],
  },
  {
    marketCode: "ESP_MAD",
    displayName: "Madrid, Spain",
    country: "Spain",
    currency: "EUR",
    flag: "🇪🇸",
    maxChangePct: 12,
    weekend: "Fri–Sat",
    cityAliases: ["madrid"],
    countryCodes: ["ES"],
  },
  {
    marketCode: "ITA_ROM",
    displayName: "Rome, Italy",
    country: "Italy",
    currency: "EUR",
    flag: "🇮🇹",
    maxChangePct: 12,
    weekend: "Fri–Sat",
    cityAliases: ["rome", "roma"],
    countryCodes: ["IT"],
  },
  {
    marketCode: "ITA_MIL",
    displayName: "Milan, Italy",
    country: "Italy",
    currency: "EUR",
    flag: "🇮🇹",
    maxChangePct: 12,
    weekend: "Fri–Sat",
    cityAliases: ["milan", "milano"],
    countryCodes: ["IT"],
  },
  {
    marketCode: "USA_MIA",
    displayName: "Miami, USA",
    country: "United States",
    currency: "USD",
    flag: "🇺🇸",
    maxChangePct: 20,
    weekend: "Fri–Sat",
    cityAliases: ["miami", "miami beach", "south beach"],
    countryCodes: ["US"],
  },
  {
    marketCode: "PRT_LIS",
    displayName: "Lisbon, Portugal",
    country: "Portugal",
    currency: "EUR",
    flag: "🇵🇹",
    maxChangePct: 12,
    weekend: "Fri–Sat",
    cityAliases: ["lisbon", "lisboa"],
    countryCodes: ["PT"],
  },
  {
    marketCode: "USA_NSH",
    displayName: "Nashville, USA",
    country: "United States",
    currency: "USD",
    flag: "🇺🇸",
    maxChangePct: 20,
    weekend: "Fri–Sat",
    cityAliases: ["nashville"],
    countryCodes: ["US"],
  },
  {
    marketCode: "AUS_SYD",
    displayName: "Sydney, Australia",
    country: "Australia",
    currency: "AUD",
    flag: "🇦🇺",
    maxChangePct: 15,
    weekend: "Fri–Sat",
    cityAliases: ["sydney"],
    countryCodes: ["AU"],
  },
];

const byCode = new Map(MARKET_REGISTRY.map((m) => [m.marketCode, m]));

export function getMarketEntry(marketCode: string): MarketRegistryEntry | undefined {
  return byCode.get(marketCode);
}

export function normalizeCity(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export function resolveMarketCodeFromLocation(city: string, countryCode?: string): MarketRegistryEntry | null {
  const normalizedCity = normalizeCity(city);
  if (!normalizedCity) return null;

  const cc = (countryCode || "").trim().toUpperCase();

  // Exact city alias match (prefer country match when multiple markets share a country)
  const cityMatches = MARKET_REGISTRY.filter((m) =>
    m.cityAliases.some((alias) => normalizedCity === alias || normalizedCity.includes(alias))
  );

  if (cityMatches.length === 1) return cityMatches[0];

  if (cityMatches.length > 1) {
    const withCountry = cityMatches.find((m) => m.countryCodes.includes(cc));
    if (withCountry) return withCountry;
    return cityMatches[0];
  }

  // Country-only fallback (Spain → Barcelona as default STR hub — only if no city match)
  if (cc === "ES") return getMarketEntry("ESP_BCN") ?? null;
  if (cc === "IT") return getMarketEntry("ITA_ROM") ?? null;
  if (cc === "AE" || cc === "UAE") return getMarketEntry("UAE_DXB") ?? null;

  return null;
}

/** Wizard / signup market picker options (subset of registry). */
export function getWizardMarketOptions() {
  return MARKET_REGISTRY.map((m) => ({
    code: m.marketCode,
    name: m.displayName.split(",")[0],
    country: m.country,
    currency: m.currency,
    flag: m.flag,
    weekend: m.weekend,
    maxChangePct: m.maxChangePct,
  }));
}
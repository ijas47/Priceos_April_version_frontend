import { MarketTemplate } from "../models/MarketTemplate";
import { MARKET_TEMPLATES_SEED } from "./market-templates";

export interface SyncMarketsResult {
  created: number;
  updated: number;
  total: number;
  codes: string[];
}

/** Upsert market templates from seed — safe for production. */
export async function syncMarketTemplatesFromSeed(): Promise<SyncMarketsResult> {
  let created = 0;
  let updated = 0;
  const codes: string[] = [];

  for (const tmpl of MARKET_TEMPLATES_SEED) {
    codes.push(tmpl.marketCode);
    const existing = await MarketTemplate.findOne({ marketCode: tmpl.marketCode });
    if (existing) {
      await MarketTemplate.findOneAndUpdate(
        { marketCode: tmpl.marketCode },
        {
          $set: {
            displayName: tmpl.displayName,
            country: tmpl.country,
            currency: tmpl.currency,
            timezone: tmpl.timezone,
            weekendDefinition: tmpl.weekendDefinition,
            flag: tmpl.flag,
            guardrailDefaults: tmpl.guardrailDefaults,
            seasonalPatterns: tmpl.seasonalPatterns,
            eventApiConfig: tmpl.eventApiConfig,
            regulatoryFlags: tmpl.regulatoryFlags,
            isActive: tmpl.isActive,
          },
        }
      );
      updated++;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await MarketTemplate.create(tmpl as any);
      created++;
    }
  }

  return { created, updated, total: MARKET_TEMPLATES_SEED.length, codes };
}

/** European + core markets to bootstrap on cron when pack is missing or stale. */
export const AUTO_BOOTSTRAP_MARKETS = [
  "ESP_BCN",
  "ESP_MAD",
  "ITA_ROM",
  "ITA_MIL",
  "GBR_LON",
  "FRA_PAR",
  "PRT_LIS",
  "NLD_AMS",
] as const;
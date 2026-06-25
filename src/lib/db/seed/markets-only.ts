/**
 * Upsert market templates only — safe to run against production Mongo.
 *
 *   npm run db:seed:markets
 *
 * Requires MONGODB_URI in environment (.env.local locally, or export from Vercel).
 */

import "dotenv/config";
import mongoose from "mongoose";
import { MarketTemplate } from "../models/MarketTemplate";
import { MARKET_TEMPLATES_SEED } from "./market-templates";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI not set");
  process.exit(1);
}

async function main() {
  console.log("📍 PriceOS market template seed (markets only)\n");
  await mongoose.connect(MONGODB_URI!);

  let created = 0;
  let updated = 0;

  for (const tmpl of MARKET_TEMPLATES_SEED) {
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
      console.log(`   ↻ ${tmpl.marketCode} — ${tmpl.displayName}`);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await MarketTemplate.create(tmpl as any);
      created++;
      console.log(`   + ${tmpl.marketCode} — ${tmpl.displayName}`);
    }
  }

  console.log(`\n✅ Done: ${created} created, ${updated} updated (${MARKET_TEMPLATES_SEED.length} total)`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
/**
 * Upsert market templates only — safe to run against production Mongo.
 *
 *   npm run db:seed:markets
 *
 * Requires MONGODB_URI in environment (.env.local locally, or export from Vercel).
 */

import { config } from "dotenv";
import { existsSync } from "fs";
import mongoose from "mongoose";
import { connectDB } from "../client";
import { syncMarketTemplatesFromSeed } from "./sync-markets";

if (existsSync(".env.local")) config({ path: ".env.local" });
else config();

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("❌ MONGODB_URI not set (.env.local or environment)");
    process.exit(1);
  }

  console.log("📍 PriceOS market template seed (markets only)\n");
  await connectDB();

  const result = await syncMarketTemplatesFromSeed();
  for (const code of result.codes) {
    console.log(`   ✓ ${code}`);
  }

  console.log(`\n✅ Done: ${result.created} created, ${result.updated} updated (${result.total} total)`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
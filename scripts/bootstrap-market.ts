import { config } from "dotenv";
import { existsSync } from "fs";
import { connectDB } from "../src/lib/db/client";
import { bootstrapMarketPricingPack } from "../src/lib/market/bootstrap-pricing-pack";

if (existsSync(".env.local")) config({ path: ".env.local" });
else config();

const marketCode = process.argv[2] || "ESP_BCN";
const force = process.argv.includes("--force");

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI not set");
    process.exit(1);
  }

  await connectDB();
  const result = await bootstrapMarketPricingPack(marketCode, { force: force || true });
  console.log("Market:", result.pack.marketCode);
  console.log("Version:", result.pack.version);
  console.log("Sources:", result.sources.join(", "));
  console.log("Cached:", result.cached);
  console.log("Segments:", result.pack.seasonalCalendars[0]?.segments?.length ?? 0);
  for (const s of result.pack.seasonalCalendars[0]?.segments ?? []) {
    console.log(`  ${s.name}: ${s.startMd} → ${s.endMd} (${s.pricingProfileId})`);
  }
  const mongoose = await import("mongoose");
  await mongoose.default.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
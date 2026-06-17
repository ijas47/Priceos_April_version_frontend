/**
 * Stress test: Airbtics comp-set / market context + pricing pipeline impact.
 * Run: node scripts/stress-test-airbtics.mjs
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const BASE = "https://crap0y5bx5.execute-api.us-east-2.amazonaws.com/prod";

function section(title) {
  console.log("\n" + "=".repeat(60));
  console.log(title);
  console.log("=".repeat(60));
}

async function testAirbticsLive() {
  const key = process.env.AIRBTICS_API_KEY?.trim();
  const result = {
    keySet: !!key,
    resolveMarket: null,
    summary: null,
    metrics: null,
    pacing: null,
    compSet: null,
    errors: [],
  };

  if (!key) {
    result.errors.push("AIRBTICS_API_KEY not set - all live calls skipped");
    return result;
  }

  const headers = { "x-api-key": key };

  try {
    const searchUrl = new URL(`${BASE}/markets/search`);
    searchUrl.searchParams.set("query", "Dubai");
    searchUrl.searchParams.set("country_code", "AE");
    const searchRes = await fetch(searchUrl, { headers, signal: AbortSignal.timeout(20000) });
    if (!searchRes.ok) {
      result.errors.push(`market search HTTP ${searchRes.status}`);
    } else {
      const data = await searchRes.json();
      const markets = data?.markets ?? [];
      result.resolveMarket = { count: markets.length, marketId: markets[0]?.market_id ?? null };
    }
  } catch (e) {
    result.errors.push(`market search: ${e.message}`);
  }

  const marketId = result.resolveMarket?.marketId ?? "2286";
  const bedrooms = "2";

  for (const [name, pathSuffix, params] of [
    ["summary", "/markets/summary", { market_id: String(marketId), bedrooms }],
    ["metrics", "/markets/metrics/all", { market_id: String(marketId), bedrooms, number_of_months: "12" }],
    ["pacing", "/markets/metrics/future-pacing", { market_id: String(marketId), bedrooms }],
  ]) {
    try {
      const url = new URL(`${BASE}${pathSuffix}`);
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
      if (!res.ok) {
        result.errors.push(`${name} HTTP ${res.status}`);
        result[name] = { ok: false };
      } else {
        const data = await res.json();
        if (name === "summary") {
          result.summary = {
            ok: true,
            p50ADR: data.average_daily_rate ?? null,
            occupancy: data.occupancy ?? null,
            activeListings: data.active_listings_count ?? null,
          };
        } else if (name === "metrics") {
          result.metrics = { ok: true, months: (data.metrics ?? []).length };
        } else {
          result.pacing = { ok: true, days: (data.pacing ?? []).length };
        }
      }
    } catch (e) {
      result.errors.push(`${name}: ${e.message}`);
    }
  }

  // Dubai Marina-ish bounds
  try {
    const res = await fetch(`${BASE}/listings/search/bounds`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        bounds: { ne_lat: 25.095, ne_lng: 55.155, sw_lat: 25.065, sw_lng: 55.125 },
        bedrooms: 2,
        page: 1,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      result.errors.push(`comp set HTTP ${res.status}`);
      result.compSet = { ok: false };
    } else {
      const data = await res.json();
      result.compSet = { ok: true, listings: (data.listings ?? []).length };
    }
  } catch (e) {
    result.errors.push(`comp set: ${e.message}`);
  }

  return result;
}

async function testMongoAndPipeline() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return { error: "MONGODB_URI not set" };

  await mongoose.connect(uri, { dbName: process.env.DATABASE_NAME || "priceos" });

  const Listing = mongoose.models.Listing || mongoose.model(
    "Listing",
    new mongoose.Schema({}, { strict: false }),
    "listings"
  );
  const InventoryMaster = mongoose.models.InventoryMaster || mongoose.model(
    "InventoryMaster",
    new mongoose.Schema({}, { strict: false }),
    "inventorymasters"
  );
  const BenchmarkData = mongoose.models.BenchmarkData || mongoose.model(
    "BenchmarkData",
    new mongoose.Schema({}, { strict: false }),
    "benchmarkdata"
  );
  const EngineRun = mongoose.models.EngineRun || mongoose.model(
    "EngineRun",
    new mongoose.Schema({}, { strict: false }),
    "engineruns"
  );

  const listing = await Listing.findOne({}).sort({ updatedAt: -1 }).lean();
  if (!listing) {
    await mongoose.disconnect();
    return { error: "No listings in DB" };
  }

  const lid = listing._id;
  const invCount = await InventoryMaster.countDocuments({ listingId: lid });
  const recentProposals = await InventoryMaster.find({ listingId: lid })
    .sort({ date: 1 })
    .limit(5)
    .select("date proposedPrice currentPrice status note")
    .lean();

  const withMarketNotes = await InventoryMaster.countDocuments({
    listingId: lid,
    note: { $regex: /\[MARKET\]/ },
  });

  const benchmark = await BenchmarkData.findOne({
    $or: [{ listingId: lid }, { orgId: listing.orgId }],
  })
    .sort({ updatedAt: -1 })
    .lean();

  const lastEngineRun = await EngineRun.findOne({ listingId: lid })
    .sort({ startedAt: -1 })
    .lean();

  const sampleNotes = await InventoryMaster.find({
    listingId: lid,
    note: { $regex: /\[MARKET\]/ },
  })
    .limit(3)
    .select("date note proposedPrice")
    .lean();

  await mongoose.disconnect();

  return {
    listing: {
      id: String(lid),
      name: listing.name,
      city: listing.city,
      countryCode: listing.countryCode,
      bedrooms: listing.bedroomsNumber,
      price: listing.price,
    },
    inventoryDays: invCount,
    proposalsWithMarketAnchor: withMarketNotes,
    marketAnchorSample: sampleNotes.map((d) => ({
      date: d.date,
      proposedPrice: d.proposedPrice,
      noteSnippet: (d.note || "").slice(0, 120),
    })),
    recentProposals: recentProposals.map((d) => ({
      date: d.date,
      proposed: d.proposedPrice,
      current: d.currentPrice,
      status: d.status,
    })),
    benchmark: benchmark
      ? {
          source: benchmark.source ?? benchmark.benchmarkSource,
          p50: benchmark.p50ADR ?? benchmark.medianRate,
          updatedAt: benchmark.updatedAt,
        }
      : null,
    lastEngineRun: lastEngineRun
      ? {
          status: lastEngineRun.status,
          startedAt: lastEngineRun.startedAt,
          errorMessage: lastEngineRun.errorMessage,
        }
      : null,
  };
}

async function main() {
  console.log("PriceOS Airbtics + Pricing Stress Test");
  console.log(new Date().toISOString());

  section("1. Environment");
  console.log({
    AIRBTICS_API_KEY: process.env.AIRBTICS_API_KEY?.trim() ? "SET" : "MISSING",
    MONGODB_URI: process.env.MONGODB_URI ? "SET" : "MISSING",
    HOSTAWAY_MODE: process.env.HOSTAWAY_MODE ?? "(default db)",
  });

  section("2. Live Airbtics API");
  const airbtics = await testAirbticsLive();
  console.log(JSON.stringify(airbtics, null, 2));

  section("3. MongoDB + Pricing Pipeline Evidence");
  try {
    const mongo = await testMongoAndPipeline();
    console.log(JSON.stringify(mongo, null, 2));
  } catch (e) {
    console.error("Mongo error:", e.message);
  }

  section("4. Verdict");
  const keyMissing = !process.env.AIRBTICS_API_KEY?.trim();
  if (keyMissing) {
    console.log("❌ AIRBTICS_API_KEY is NOT configured locally.");
    console.log("   → Market Intel tab will show errors / empty data.");
    console.log("   → Pricing engine Pass 0 (Market Anchor) is a NO-OP.");
    console.log("   → Proposals still run from listing price + rules + calendar.");
    console.log("   → market-setup falls back to Lyzr benchmark when no p50ADR.");
  } else if (airbtics.errors.length) {
    console.log("⚠️  API key set but some Airbtics calls failed - see errors above.");
  } else {
    console.log("✅ Airbtics live API healthy.");
    console.log(`   Comp set listings: ${airbtics.compSet?.listings ?? 0}`);
    console.log(`   Market p50 ADR: ${airbtics.summary?.p50ADR ?? "n/a"}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
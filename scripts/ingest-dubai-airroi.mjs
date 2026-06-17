/**
 * Ingest Dubai AirROI Kaggle dataset into MongoDB.
 *
 * Usage:
 *   node scripts/ingest-dubai-airroi.mjs
 *   node scripts/ingest-dubai-airroi.mjs --csv data/dubai-airroi/past_rates.csv
 *
 * First-time download (requires Kaggle auth):
 *   kaggle auth login
 *   kaggle datasets download -d jasonairroi/airbnb-short-term-rental-data-dubai -p data/dubai-airroi --unzip
 */

import { createRequire } from "module";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createReadStream } from "fs";
import { createInterface } from "readline";

const require = createRequire(import.meta.url);
const mongoose = require("mongoose");

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Load .env
try {
  const envFile = readFileSync(resolve(ROOT, ".env"), "utf8");
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^"|"$/g, "");
    process.env[key] = process.env[key] ?? val;
  }
} catch {
  console.warn("Could not read .env - using existing environment variables.");
}

const SOURCE_VERSION = "jasonairroi/airbnb-short-term-rental-data-dubai:v3";

const DUBAI_AREA_BOUNDS = {
  dubai_city: { ne_lat: 25.28, ne_lng: 55.35, sw_lat: 25.05, sw_lng: 55.1 },
  "dubai marina": { ne_lat: 25.095, ne_lng: 55.155, sw_lat: 25.065, sw_lng: 55.125 },
  jbr: { ne_lat: 25.085, ne_lng: 55.135, sw_lat: 25.065, sw_lng: 55.115 },
  "downtown dubai": { ne_lat: 25.205, ne_lng: 55.285, sw_lat: 25.185, sw_lng: 55.265 },
  "business bay": { ne_lat: 25.195, ne_lng: 55.275, sw_lat: 25.175, sw_lng: 55.255 },
  "palm jumeirah": { ne_lat: 25.125, ne_lng: 55.145, sw_lat: 25.095, sw_lng: 55.115 },
  jvc: { ne_lat: 25.065, ne_lng: 55.215, sw_lat: 25.045, sw_lng: 55.195 },
  "dubai hills": { ne_lat: 25.115, ne_lng: 55.255, sw_lat: 25.095, sw_lng: 55.235 },
  "city walk": { ne_lat: 25.215, ne_lng: 55.265, sw_lat: 25.195, sw_lng: 55.245 },
};

const NEIGHBORHOOD_TO_AREA = {
  "downtown dubai": "downtown dubai",
  "business bay": "business bay",
  "dubai marina": "dubai marina",
  "jumeirah beach residence": "jbr",
  "jumeirah village circle": "jvc",
  "palm jumeirah": "palm jumeirah",
  "dubai hills": "dubai hills",
  "dubai hills estate": "dubai hills",
};

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function inBounds(lat, lng, bounds) {
  return (
    lat >= bounds.sw_lat &&
    lat <= bounds.ne_lat &&
    lng >= bounds.sw_lng &&
    lng <= bounds.ne_lng
  );
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return Math.round(sorted[idx]);
}

function resolveAreaKeys(lat, lng, neighborhood) {
  const keys = new Set(["dubai_city"]);
  for (const [areaKey, bounds] of Object.entries(DUBAI_AREA_BOUNDS)) {
    if (areaKey !== "dubai_city" && inBounds(lat, lng, bounds)) {
      keys.add(areaKey);
    }
  }
  const nh = (neighborhood || "").trim().toLowerCase();
  if (nh && NEIGHBORHOOD_TO_AREA[nh]) {
    keys.add(NEIGHBORHOOD_TO_AREA[nh]);
  }
  return [...keys];
}

function avg(nums) {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

const args = process.argv.slice(2);
const csvArgIdx = args.indexOf("--csv");
const csvPath =
  csvArgIdx >= 0
    ? args[csvArgIdx + 1]
    : resolve(ROOT, "data/dubai-airroi/past_rates.csv");

if (!existsSync(csvPath)) {
  console.error(`CSV not found: ${csvPath}`);
  console.error("Download with:");
  console.error(
    "  kaggle datasets download -d jasonairroi/airbnb-short-term-rental-data-dubai -p data/dubai-airroi --unzip"
  );
  process.exit(1);
}

const DubaiCompListingSchema = new mongoose.Schema(
  {
    listingId: { type: String, required: true, unique: true },
    listingType: String,
    roomType: String,
    neighborhood: String,
    latitude: Number,
    longitude: Number,
    bedrooms: Number,
    currency: { type: String, default: "AED" },
    ttmAvgRate: Number,
    ttmOccupancy: Number,
    l90dAvgRate: Number,
    l90dOccupancy: Number,
    lastMonthDate: String,
    source: { type: String, default: "airroi_dubai_kaggle" },
    sourceVersion: String,
    ingestedAt: Date,
  },
  { timestamps: true }
);

const DubaiMarketMonthlySchema = new mongoose.Schema(
  {
    areaKey: String,
    bedrooms: Number,
    month: String,
    listingCount: Number,
    p25Adr: Number,
    p50Adr: Number,
    p75Adr: Number,
    avgOccupancy: Number,
    source: { type: String, default: "airroi_dubai_kaggle" },
    sourceVersion: String,
    ingestedAt: Date,
  },
  { timestamps: true }
);
DubaiMarketMonthlySchema.index({ areaKey: 1, bedrooms: 1, month: 1 }, { unique: true });

const DubaiMarketMetaSchema = new mongoose.Schema(
  {
    source: { type: String, default: "airroi_dubai_kaggle" },
    sourceVersion: String,
    listingCount: Number,
    monthlyRowCount: Number,
    monthFrom: String,
    monthTo: String,
    ingestedAt: Date,
  },
  { timestamps: true }
);

const DubaiCompListing =
  mongoose.models.DubaiCompListing ||
  mongoose.model("DubaiCompListing", DubaiCompListingSchema);
const DubaiMarketMonthly =
  mongoose.models.DubaiMarketMonthly ||
  mongoose.model("DubaiMarketMonthly", DubaiMarketMonthlySchema);
const DubaiMarketMeta =
  mongoose.models.DubaiMarketMeta ||
  mongoose.model("DubaiMarketMeta", DubaiMarketMetaSchema);

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI not set");

  await mongoose.connect(uri);
  console.log("Connected to MongoDB");

  const ingestedAt = new Date();
  const listingMonths = new Map();
  const aggregateBuckets = new Map();
  let rowCount = 0;
  let monthMin = null;
  let monthMax = null;

  const rl = createInterface({
    input: createReadStream(csvPath),
    crlfDelay: Infinity,
  });

  let headers = null;
  for await (const line of rl) {
    if (!headers) {
      headers = parseCsvLine(line);
      continue;
    }
    const cols = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? ""]));

    const listingId = row.listing_id;
    if (!listingId) continue;

    const lat = parseFloat(row.latitude);
    const lng = parseFloat(row.longitude);
    const bedrooms = Math.round(parseFloat(row.bedrooms) || 0);
    const monthDate = row.month_date;
    const ym = monthDate?.slice(0, 7);
    const adr = parseFloat(row.native_avg_daily_rate || row.avg_daily_rate || "0");
    const occ = parseFloat(row.occupancy || "0");

    if (!listingMonths.has(listingId)) {
      listingMonths.set(listingId, {
        listingId,
        listingType: row.listing_type,
        roomType: row.room_type,
        neighborhood: row.neighborhood,
        latitude: lat,
        longitude: lng,
        bedrooms,
        currency: row.currency || "AED",
        months: [],
      });
    }

    const entry = listingMonths.get(listingId);
    entry.months.push({
      monthDate,
      adr: adr > 0 ? adr : null,
      occ: Number.isFinite(occ) ? occ : null,
    });

    if (ym) {
      if (!monthMin || ym < monthMin) monthMin = ym;
      if (!monthMax || ym > monthMax) monthMax = ym;

      if (adr > 0 && Number.isFinite(lat) && Number.isFinite(lng)) {
        const areaKeys = resolveAreaKeys(lat, lng, row.neighborhood);
        for (const areaKey of areaKeys) {
          const bucketKey = `${areaKey}|${bedrooms}|${ym}`;
          if (!aggregateBuckets.has(bucketKey)) {
            aggregateBuckets.set(bucketKey, {
              areaKey,
              bedrooms,
              month: ym,
              rates: [],
              occupancies: [],
            });
          }
          const bucket = aggregateBuckets.get(bucketKey);
          bucket.rates.push(adr);
          if (Number.isFinite(occ)) bucket.occupancies.push(occ);
        }
      }
    }

    rowCount++;
    if (rowCount % 20000 === 0) {
      console.log(`  parsed ${rowCount.toLocaleString("en-US")} rows...`);
    }
  }

  console.log(`Parsed ${rowCount.toLocaleString("en-US")} rows, ${listingMonths.size} listings`);

  const listingOps = [];
  for (const entry of listingMonths.values()) {
    const sorted = [...entry.months].sort((a, b) =>
      a.monthDate.localeCompare(b.monthDate)
    );
    const last12 = sorted.slice(-12);
    const last3 = sorted.slice(-3);

    const ttmRates = last12.map((m) => m.adr).filter((r) => r > 0);
    const ttmOcc = last12.map((m) => m.occ).filter((o) => o != null);
    const l90Rates = last3.map((m) => m.adr).filter((r) => r > 0);
    const l90Occ = last3.map((m) => m.occ).filter((o) => o != null);

    listingOps.push({
      updateOne: {
        filter: { listingId: entry.listingId },
        update: {
          $set: {
            listingId: entry.listingId,
            listingType: entry.listingType,
            roomType: entry.roomType,
            neighborhood: entry.neighborhood,
            latitude: entry.latitude,
            longitude: entry.longitude,
            bedrooms: entry.bedrooms,
            currency: entry.currency,
            ttmAvgRate: avg(ttmRates) ? Math.round(avg(ttmRates)) : undefined,
            ttmOccupancy: avg(ttmOcc) ?? undefined,
            l90dAvgRate: avg(l90Rates) ? Math.round(avg(l90Rates)) : undefined,
            l90dOccupancy: avg(l90Occ) ?? undefined,
            lastMonthDate: sorted.at(-1)?.monthDate,
            source: "airroi_dubai_kaggle",
            sourceVersion: SOURCE_VERSION,
            ingestedAt,
          },
        },
        upsert: true,
      },
    });
  }

  const monthlyOps = [];
  for (const bucket of aggregateBuckets.values()) {
    const rates = bucket.rates.filter((r) => r > 0).sort((a, b) => a - b);
    if (rates.length < 3) continue;
    monthlyOps.push({
      updateOne: {
        filter: {
          areaKey: bucket.areaKey,
          bedrooms: bucket.bedrooms,
          month: bucket.month,
        },
        update: {
          $set: {
            areaKey: bucket.areaKey,
            bedrooms: bucket.bedrooms,
            month: bucket.month,
            listingCount: rates.length,
            p25Adr: percentile(rates, 25),
            p50Adr: percentile(rates, 50),
            p75Adr: percentile(rates, 75),
            avgOccupancy: avg(bucket.occupancies) ?? 0,
            source: "airroi_dubai_kaggle",
            sourceVersion: SOURCE_VERSION,
            ingestedAt,
          },
        },
        upsert: true,
      },
    });
  }

  console.log(`Upserting ${listingOps.length} listings...`);
  for (let i = 0; i < listingOps.length; i += 500) {
    await DubaiCompListing.bulkWrite(listingOps.slice(i, i + 500));
  }

  console.log(`Upserting ${monthlyOps.length} monthly aggregates...`);
  for (let i = 0; i < monthlyOps.length; i += 500) {
    await DubaiMarketMonthly.bulkWrite(monthlyOps.slice(i, i + 500));
  }

  await DubaiMarketMeta.create({
    source: "airroi_dubai_kaggle",
    sourceVersion: SOURCE_VERSION,
    listingCount: listingMonths.size,
    monthlyRowCount: rowCount,
    monthFrom: monthMin,
    monthTo: monthMax,
    ingestedAt,
  });

  console.log("Done.");
  console.log({
    listings: listingOps.length,
    monthlyAggregates: monthlyOps.length,
    monthFrom: monthMin,
    monthTo: monthMax,
  });

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
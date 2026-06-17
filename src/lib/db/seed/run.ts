/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * MongoDB Seed Script
 * Run with: npm run db:seed
 *
 * Seeds:
 *   1. MarketTemplates   - 10 global markets
 *   2. Sources           - 4 pipeline sources
 *   3. Detectors         - 12 signal detectors
 *   4. Organization      - demo org (admin account)
 *   5. Listings          - 5 sample Dubai properties (linked to demo org)
 *
 * IMPORTANT: Only run once on a fresh database, or it will skip existing docs.
 */

import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

import { MarketTemplate } from "../models/MarketTemplate";
import { Source } from "../models/Source";
import { Detector } from "../models/Detector";
import { Organization } from "../models/Organization";
import { Listing } from "../models/Listing";

import { MARKET_TEMPLATES_SEED } from "./market-templates";
import { SOURCES_SEED, DETECTORS_SEED } from "./sources-detectors";
import { SAMPLE_LISTINGS_SEED } from "./listings";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI not set in environment");
  process.exit(1);
}

async function seed() {
  console.log("🌱 PriceOS MongoDB Seed Starting...\n");

  await mongoose.connect(MONGODB_URI!);
  console.log("✅ Connected to MongoDB\n");

  // ─── 1. Market Templates ──────────────────────────────────
  console.log("📍 Seeding market templates...");
  let templateCount = 0;
  for (const tmpl of MARKET_TEMPLATES_SEED) {
    const existing = await MarketTemplate.findOne({ marketCode: tmpl.marketCode });
    if (existing) {
      // Update to keep seed data fresh
      await MarketTemplate.findOneAndUpdate({ marketCode: tmpl.marketCode }, { $set: tmpl } as any);
      console.log(`   ↻ Updated: ${tmpl.displayName}`);
    } else {
      await MarketTemplate.create(tmpl as any);
      console.log(`   + Created: ${tmpl.displayName}`);
      templateCount++;
    }
  }
  console.log(`✅ Market templates: ${MARKET_TEMPLATES_SEED.length} processed (${templateCount} new)\n`);

  // ─── 2. Sources ───────────────────────────────────────────
  console.log("🔌 Seeding pipeline sources...");
  let sourceCount = 0;
  for (const src of SOURCES_SEED) {
    const existing = await Source.findOne({ sourceId: src.sourceId });
    if (existing) {
      await Source.findOneAndUpdate({ sourceId: src.sourceId }, { $set: src } as any);
      console.log(`   ↻ Updated: ${src.name}`);
    } else {
      await Source.create(src as any);
      console.log(`   + Created: ${src.name}`);
      sourceCount++;
    }
  }
  console.log(`✅ Sources: ${SOURCES_SEED.length} processed (${sourceCount} new)\n`);

  // ─── 3. Detectors ─────────────────────────────────────────
  console.log("🔍 Seeding detectors...");
  let detectorCount = 0;
  for (const det of DETECTORS_SEED) {
    const existing = await Detector.findOne({ detectorId: det.detectorId });
    if (existing) {
      await Detector.findOneAndUpdate({ detectorId: det.detectorId }, { $set: det } as any);
      console.log(`   ↻ Updated: ${det.name}`);
    } else {
      await Detector.create(det as any);
      console.log(`   + Created: ${det.name}`);
      detectorCount++;
    }
  }
  console.log(`✅ Detectors: ${DETECTORS_SEED.length} processed (${detectorCount} new)\n`);

  // ─── 4. Demo Organization ─────────────────────────────────
  console.log("🏢 Seeding demo organization...");
  const DEMO_EMAIL = "admin@priceos.demo";
  const DEMO_PASSWORD = "PriceOS@2025";

  let org = await Organization.findOne({ email: DEMO_EMAIL });
  if (org) {
    console.log(`   ↻ Demo org already exists: ${org.name} (${org.email})`);
  } else {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
    const dubaiTemplate = await MarketTemplate.findOne({ marketCode: "UAE_DXB" });

    org = await Organization.create({
      name: "Dubai Stays Management",
      email: DEMO_EMAIL,
      passwordHash,
      fullName: "Ijas Abdulla",
      role: "owner",
      isApproved: true,
      marketCode: "UAE_DXB",
      currency: "AED",
      timezone: "Asia/Dubai",
      plan: "growth",
      settings: {
        guardrails: {
          maxSingleDayChangePct: dubaiTemplate?.guardrailDefaults?.maxSingleDayChangePct ?? 15,
          autoApproveThreshold: dubaiTemplate?.guardrailDefaults?.autoApproveThreshold ?? 5,
          absoluteFloorMultiplier: dubaiTemplate?.guardrailDefaults?.absoluteFloorMultiplier ?? 0.5,
          absoluteCeilingMultiplier: dubaiTemplate?.guardrailDefaults?.absoluteCeilingMultiplier ?? 3.0,
        },
        automation: { autoPushApproved: false, dailyPipelineRun: true },
        overrides: {},
      },
    });
    console.log(`   + Created demo org: ${org.name} (${org.email})`);
    console.log(`   📧 Email:    ${DEMO_EMAIL}`);
    console.log(`   🔑 Password: ${DEMO_PASSWORD}`);
  }
  console.log(`✅ Demo organization: ${org._id}\n`);

  // ─── 5. Sample Listings ───────────────────────────────────
  console.log("🏠 Seeding sample listings...");
  let listingCount = 0;
  for (const listing of SAMPLE_LISTINGS_SEED) {
    const existing = await Listing.findOne({ hostawayId: listing.hostawayId });
    if (existing) {
      console.log(`   ↻ Skipped (already exists): ${listing.name}`);
    } else {
      await Listing.create({ ...listing, orgId: org._id } as any);
      console.log(`   + Created: ${listing.name}`);
      listingCount++;
    }
  }
  console.log(`✅ Listings: ${SAMPLE_LISTINGS_SEED.length} processed (${listingCount} new)\n`);

  // ─── Summary ──────────────────────────────────────────────
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🎉 Seed complete!\n");
  console.log("Login credentials for the demo account:");
  console.log(`  Email:    ${DEMO_EMAIL}`);
  console.log(`  Password: ${DEMO_PASSWORD}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});

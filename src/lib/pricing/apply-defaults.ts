import mongoose from "mongoose";
import { connectDB, Organization, Listing, PricingRule } from "@/lib/db";
import { UAE_PRICELABS_DEFAULTS } from "./uae-pricelabs-defaults";
import type { MarketPricingPack } from "./types";

/**
 * Persist UAE PriceLabs pack on the org and materialize seasonal + LOS rules per listing.
 */
export async function applyPricingPackToOrg(
  orgId: mongoose.Types.ObjectId | string,
  pack: MarketPricingPack = UAE_PRICELABS_DEFAULTS
): Promise<{ listingsUpdated: number; rulesCreated: number }> {
  await connectDB();
  const oid = typeof orgId === "string" ? new mongoose.Types.ObjectId(orgId) : orgId;

  await Organization.findByIdAndUpdate(oid, {
    $set: {
      pricingPack: pack,
      pricingPackVersion: pack.version,
      eventPricingWeight: "low",
    },
  });

  const listings = await Listing.find({ orgId: oid, isActive: { $ne: false } }).lean();
  let rulesCreated = 0;
  const currentYear = new Date().getFullYear();
  const calendar = pack.seasonalCalendars.find(
    (c) => c.id === pack.portfolioDefaults.defaultSeasonalCalendarId
  );

  for (const listing of listings) {
    const lid = listing._id as mongoose.Types.ObjectId;
    const basePrice = Number(listing.price) || 0;

    await Listing.findByIdAndUpdate(lid, {
      $set: {
        usePortfolioPricingDefaults: true,
        occupancyEnabled: true,
        occupancyLookbackDays: 30,
        lastMinuteRampEnabled: true,
        lastMinuteRampDays: 60,
        lastMinuteMaxDiscountPct: 30,
        lastMinuteMinDiscountPct: 0,
        lastMinuteEnabled: true,
        lastMinuteDaysOut: 60,
        lastMinuteDiscountPct: 30,
        gapFillEnabled: true,
        gapFillDiscountPct: pack.portfolioDefaults.orphanDays.discountPct,
      },
    });

    // Remove legacy %-based seasonal rules; month-first market anchor + profile
    // switching replaces stacked SEASON priceAdjPct rules.
    await PricingRule.deleteMany({
      listingId: lid,
      name: { $regex: /^\[(UAE|Auto)\]/ },
      ruleType: "SEASON",
    });

    const rules: Record<string, unknown>[] = [];

    const summerProfile = pack.pricingProfiles.find((p) => p.id === "low_season_summer");
    if (summerProfile) {
      rules.push(
        {
          orgId: oid,
          listingId: lid,
          ruleType: "LOS_DISCOUNT",
          name: "[UAE] Weekly discount (off-season)",
          enabled: true,
          priority: 5,
          minNights: 7,
          priceAdjPct: -15,
          isBlocked: false,
          closedToArrival: false,
          closedToDeparture: false,
          suspendLastMinute: false,
          suspendGapFill: false,
        },
        {
          orgId: oid,
          listingId: lid,
          ruleType: "LOS_DISCOUNT",
          name: "[UAE] Monthly discount (off-season)",
          enabled: true,
          priority: 5,
          minNights: 28,
          priceAdjPct: -25,
          isBlocked: false,
          closedToArrival: false,
          closedToDeparture: false,
          suspendLastMinute: false,
          suspendGapFill: false,
        }
      );
    }

    if (rules.length > 0) {
      await PricingRule.insertMany(rules);
      rulesCreated += rules.length;
    }
  }

  return { listingsUpdated: listings.length, rulesCreated };
}

export async function ensureUaeDefaultsForOrg(orgId: string): Promise<void> {
  await connectDB();
  const org = await Organization.findById(orgId).lean();
  if (!org) return;
  if (org.pricingPackVersion === UAE_PRICELABS_DEFAULTS.version) return;
  if (org.marketCode && org.marketCode !== "UAE_DXB") return;
  await applyPricingPackToOrg(orgId);
}
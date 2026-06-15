/**
 * Refresh verified + DTCM event feeds for all listings in an org.
 */

import { addDays, format } from "date-fns";
import mongoose from "mongoose";
import { Listing } from "@/lib/db";
import { gatherMarketIntelligence } from "./aggregator";
import { resolveDtcmEligibility } from "./dtcm-eligibility";
import { upsertVerifiedFindings } from "./ensure-market-intel";

export interface OrgEventSyncResult {
  listingsProcessed: number;
  totalSaved: number;
  dtcm: { enabled: boolean; reason: string; mode?: string };
  sourceBreakdown: Record<string, number>;
  window: { from: string; to: string };
}

export async function syncOrgMarketEvents(
  orgId: mongoose.Types.ObjectId,
  daysAhead = 90
): Promise<OrgEventSyncResult> {
  const dateFrom = format(new Date(), "yyyy-MM-dd");
  const dateTo = format(addDays(new Date(), daysAhead), "yyyy-MM-dd");

  const dtcmStatus = await resolveDtcmEligibility(orgId);

  const listings = await Listing.find({ orgId })
    .select("_id city area countryCode")
    .lean();

  let totalSaved = 0;
  const mergedBreakdown: Record<string, number> = {};

  for (const listing of listings) {
    const listingId = listing._id as mongoose.Types.ObjectId;
    const city = listing.city || "Dubai";
    const area = listing.area || city;

    const intel = await gatherMarketIntelligence({
      city,
      area: area !== city ? area : undefined,
      countryCode: listing.countryCode || "AE",
      dateFrom,
      dateTo,
      enableDtcm: dtcmStatus.enabled,
    });

    for (const [key, entry] of Object.entries(intel.sourceBreakdown)) {
      if (entry.status === "ok") {
        mergedBreakdown[key] = (mergedBreakdown[key] || 0) + entry.findings;
      }
    }

    totalSaved += await upsertVerifiedFindings({
      orgId,
      listingId,
      area,
      findings: intel.findings,
    });

    if (intel.findings.length > 0) {
      const { MarketEvent } = await import("@/lib/db");
      await MarketEvent.updateMany(
        {
          orgId,
          listingId,
          source: "ai_detected",
          startDate: { $lte: dateTo },
          endDate: { $gte: dateFrom },
          isActive: true,
        },
        { $set: { isActive: false } }
      );
    }
  }

  return {
    listingsProcessed: listings.length,
    totalSaved,
    dtcm: {
      enabled: dtcmStatus.enabled,
      reason: dtcmStatus.reason,
      mode: dtcmStatus.hasApiKey ? "live_or_curated" : "curated",
    },
    sourceBreakdown: mergedBreakdown,
    window: { from: dateFrom, to: dateTo },
  };
}
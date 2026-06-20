import mongoose from "mongoose";
import { connectDB, Listing, Reservation, InventoryMaster, Insight } from "@/lib/db";
import type { getMarketContext } from "@/lib/airbtics/market-context";
import {
  assessListingPriceSanity,
  buildListingPriceSanityInsightCopy,
  computeTtmAdr,
  ttmCutoffDate,
  type ListingPriceSanityResult,
} from "@/lib/pricing/listing-price-sanity";
import { resolveDemandRegime } from "@/lib/pricing/demand-regime";

export interface RunListingPriceSanityOptions {
  listingId: string;
  orgId: string;
  marketCtx?: Awaited<ReturnType<typeof getMarketContext>> | null;
  /** Skip Insight creation (e.g. dry run). */
  skipInsight?: boolean;
}

export interface RunListingPriceSanityOutcome {
  listingId: string;
  result: ListingPriceSanityResult;
  insightCreated: boolean;
}

export async function runListingPriceSanity(
  options: RunListingPriceSanityOptions
): Promise<RunListingPriceSanityOutcome> {
  await connectDB();

  const listingOid = new mongoose.Types.ObjectId(options.listingId);
  const orgOid = new mongoose.Types.ObjectId(options.orgId);

  const listing = await Listing.findOne({ _id: listingOid, orgId: orgOid }).lean();
  if (!listing) {
    throw new Error(`Listing not found: ${options.listingId}`);
  }

  const cutoff = ttmCutoffDate();
  const [reservations, inventoryRows] = await Promise.all([
    Reservation.find({
      listingId: listingOid,
      status: { $in: ["confirmed", "checked_in", "checked_out", "pending"] },
      checkOut: { $gte: cutoff },
    })
      .select("totalPrice nights")
      .lean(),
    InventoryMaster.find({ listingId: listingOid })
      .select("currentPrice date")
      .sort({ date: 1 })
      .limit(120)
      .lean(),
  ]);

  const { adr: ttmAdr, count: ttmReservationCount } = computeTtmAdr(reservations);
  const calendarPrices = inventoryRows
    .map((r) => Number(r.currentPrice ?? 0))
    .filter((p) => p > 0);

  const monthlyP50s =
    options.marketCtx?.monthlyMetrics
      ?.map((m) => m.p50_adr)
      .filter((v): v is number => !!v && v > 0) ?? [];
  const marketP50 =
    options.marketCtx?.p50ADR ??
    (monthlyP50s.length > 0
      ? Math.round(monthlyP50s.reduce((s, v) => s + v, 0) / monthlyP50s.length)
      : null);

  const demandRegime = resolveDemandRegime({
    marketOccupancy: options.marketCtx?.occupancy ?? null,
    month: new Date().getMonth() + 1,
    city: listing.city || "Dubai",
    countryCode: listing.countryCode || "AE",
    listedPrice: Number(listing.price) || 0,
  });

  const result = assessListingPriceSanity({
    listedPrice: Number(listing.price) || 0,
    calendarPrices,
    ttmAdr,
    ttmReservationCount,
    marketP50,
    demandRegime: demandRegime.regime,
  });

  await Listing.findByIdAndUpdate(listingOid, {
    $set: {
      basePriceSource: result.source,
      basePriceConfidencePct: result.confidencePct,
      basePriceSampleSize: result.sampleSize,
      validatedBasePrice: result.trustedBasePrice,
      pmsPriceTrusted: result.pmsPriceTrusted,
      basePriceValidatedAt: new Date(),
    },
  });

  let insightCreated = false;
  if (!options.skipInsight && (result.isPlaceholder || !result.pmsPriceTrusted)) {
    await Insight.updateMany(
      {
        orgId: orgOid,
        listingId: listingOid,
        detectorKey: "listing_price_sanity",
        status: "pending",
      },
      { $set: { status: "superseded" } }
    );

    const copy = buildListingPriceSanityInsightCopy(
      listing.name,
      result,
      listing.currencyCode ?? "AED"
    );

    await Insight.create({
      orgId: orgOid,
      listingId: listingOid,
      category: "COMPETITOR_RATE",
      severity: copy.severity,
      status: "pending",
      title: copy.title,
      summary: copy.summary,
      confidence: result.confidencePct / 100,
      detectorKey: "listing_price_sanity",
      signalData: {
        source: result.source,
        listedReference: result.listedReference,
        referencePrice: result.referencePrice,
        trustedBasePrice: result.trustedBasePrice,
        deviationPct: result.deviationPct,
        flags: result.flags,
        isPlaceholder: result.isPlaceholder,
      },
      action: {
        type: "advisory",
        scope: "base_price",
        data: {
          recommendedBase: result.trustedBasePrice,
          basePriceSource: result.source,
        },
      },
    });
    insightCreated = true;
  }

  return { listingId: options.listingId, result, insightCreated };
}
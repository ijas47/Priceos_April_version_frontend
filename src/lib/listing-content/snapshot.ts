import mongoose from "mongoose";
import { connectDB, Listing, ListingContentSnapshot } from "@/lib/db";
import { createHostawayClient } from "@/lib/hostaway/client";
import type { HostawayListing } from "@/lib/hostaway/types";
import type { ListingContentChannels, ListingContentShared } from "./types";
import { resolveHostawayApiKey } from "./hostaway-key";
import { scoreListingVisibility } from "./scorecard";

type HostawayListingRaw = HostawayListing & Record<string, unknown>;

export function normalizeHostawayListing(raw: HostawayListingRaw): {
  channels: ListingContentChannels;
  shared: ListingContentShared;
} {
  const description = String(raw.description ?? "");
  const amenities = Array.isArray(raw.amenities)
    ? raw.amenities.map(String)
    : [];

  return {
    channels: {
      airbnb: {
        title: String(raw.airbnbName ?? raw.externalListingName ?? raw.name ?? ""),
        summary: String(raw.airbnbSummary ?? ""),
        listingUrl: raw.airbnbListingUrl ? String(raw.airbnbListingUrl) : undefined,
      },
      booking_com: {
        title: String(raw.externalListingName ?? raw.name ?? ""),
        description,
        listingUrl: undefined,
      },
      vrbo: {
        headline: String(raw.homeawayPropertyHeadline ?? ""),
        description,
        listingUrl: raw.vrboListingUrl ? String(raw.vrboListingUrl) : undefined,
      },
    },
    shared: {
      description,
      amenities,
      personCapacity: raw.personCapacity != null ? Number(raw.personCapacity) : undefined,
      bedroomsNumber: raw.bedroomsNumber != null ? Number(raw.bedroomsNumber) : undefined,
      averageReviewRating:
        raw.averageReviewRating != null ? Number(raw.averageReviewRating) : undefined,
    },
  };
}

export async function syncListingContentFromHostaway(opts: {
  orgId: mongoose.Types.ObjectId;
  listingId: mongoose.Types.ObjectId;
}): Promise<{ snapshotId: string; visibilityScore: number }> {
  const { orgId, listingId } = opts;
  await connectDB();

  const listing = await Listing.findOne({ _id: listingId, orgId })
    .select("hostawayId name")
    .lean();
  if (!listing) throw new Error("Listing not found");
  if (!listing.hostawayId?.trim()) {
    throw new Error("Listing has no Hostaway ID - import from PMS first");
  }

  const apiKey = await resolveHostawayApiKey(orgId);
  if (!apiKey) throw new Error("Hostaway API key not configured");

  const client = createHostawayClient(apiKey);
  const raw = (await client.getListing(
    parseInt(listing.hostawayId, 10)
  )) as HostawayListingRaw;

  const { channels, shared } = normalizeHostawayListing(raw);
  const scores = scoreListingVisibility(channels, shared);

  const doc = await ListingContentSnapshot.findOneAndUpdate(
    { orgId, listingId },
    {
      $set: {
        orgId,
        listingId,
        hostawayId: String(listing.hostawayId),
        channels,
        shared,
        visibilityScore: scores.overall,
        channelScores: scores.byChannel,
        hostawayRaw: raw,
        capturedAt: new Date(),
      },
    },
    { upsert: true, new: true }
  ).lean();

  return {
    snapshotId: doc!._id.toString(),
    visibilityScore: scores.overall,
  };
}
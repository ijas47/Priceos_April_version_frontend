import mongoose from "mongoose";
import { connectDB, Listing, ListingContentSnapshot, type IListingContentSnapshot } from "@/lib/db";
import { LISTING_OPTIMIZER_AGENT_ID } from "@/lib/agents/constants";
import type {
  ContentChannel,
  ContentField,
  ContentRisk,
  OptimizerProposalDraft,
  OptimizerResult,
} from "./types";
import { scoreChannelContent, scoreListingVisibility } from "./scorecard";
import { getChannelMix } from "./channel-mix";

async function callLyzrOptimizer(message: string): Promise<OptimizerResult | null> {
  const LYZR_API_KEY = process.env.LYZR_API_KEY;
  const LYZR_API_URL = process.env.LYZR_API_URL || "https://studio.lyzr.ai/inference/chat";
  if (!LYZR_API_KEY || !LISTING_OPTIMIZER_AGENT_ID) return null;

  try {
    const response = await fetch(LYZR_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": LYZR_API_KEY },
      body: JSON.stringify({
        user_id: "priceos-listing-optimizer",
        agent_id: LISTING_OPTIMIZER_AGENT_ID,
        session_id: `content-${Date.now()}`,
        message,
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const rawStr =
      data.response?.message ||
      data.response?.result?.message ||
      data.response ||
      data.message ||
      "";
    const jsonMatch = String(rawStr).match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as {
      audit?: { overall_visibility_score?: number; by_channel?: Record<string, number> };
      proposals?: Array<{
        channel: string;
        field: string;
        current?: string;
        proposed: string;
        reasoning?: string;
        visibility_delta?: number;
        risk?: string;
      }>;
    };

    const proposals: OptimizerProposalDraft[] = (parsed.proposals || [])
      .filter((p) => p.proposed?.trim())
      .map((p) => ({
        channel: normalizeChannel(p.channel),
        field: normalizeField(p.field),
        current: String(p.current ?? ""),
        proposed: String(p.proposed).trim(),
        reasoning: String(p.reasoning ?? "Lyzr listing optimizer suggestion"),
        visibilityDelta: Number(p.visibility_delta ?? 8),
        risk: normalizeRisk(p.risk),
      }));

    if (proposals.length === 0) return null;

    return {
      source: "lyzr",
      audit: {
        overall: Number(parsed.audit?.overall_visibility_score ?? 0),
        byChannel: parsed.audit?.by_channel as OptimizerResult["audit"]["byChannel"],
      },
      proposals,
    };
  } catch {
    return null;
  }
}

function normalizeChannel(c: string): ContentChannel {
  const n = c.toLowerCase();
  if (n.includes("airbnb")) return "airbnb";
  if (n.includes("booking")) return "booking_com";
  if (n.includes("vrbo") || n.includes("homeaway")) return "vrbo";
  return "airbnb";
}

function normalizeField(f: string): ContentField {
  const n = f.toLowerCase();
  if (n === "summary") return "summary";
  if (n === "headline") return "headline";
  if (n === "description") return "description";
  return "title";
}

function normalizeRisk(r?: string): ContentRisk {
  if (r === "high") return "high";
  if (r === "medium") return "medium";
  return "low";
}

function topAmenities(amenities: string[], n = 3): string[] {
  const priority = ["pool", "wifi", "sea view", "gym", "parking", "kitchen", "beach"];
  const lower = amenities.map((a) => a.toLowerCase());
  const picked: string[] = [];
  for (const p of priority) {
    const match = amenities.find((a) => a.toLowerCase().includes(p));
    if (match && !picked.includes(match)) picked.push(match);
    if (picked.length >= n) break;
  }
  for (const a of amenities) {
    if (picked.length >= n) break;
    if (!picked.includes(a)) picked.push(a);
  }
  return picked.slice(0, n);
}

function buildRulesProposals(
  listing: { name: string; area: string; city: string; bedroomsNumber: number },
  snapshot: Pick<IListingContentSnapshot, "channels" | "shared">
): OptimizerProposalDraft[] {
  const { channels, shared } = snapshot;
  const area = listing.area || listing.city;
  const beds = listing.bedroomsNumber || shared.bedroomsNumber || 1;
  const amenities = topAmenities(shared.amenities);
  const amenityBit = amenities.length ? amenities.join(" · ") : "WiFi · AC";

  const proposals: OptimizerProposalDraft[] = [];

  const airbnbTitleCurrent = channels.airbnb.title || listing.name;
  const airbnbTitle = `${area} ${beds}BR | ${amenityBit}`.slice(0, 50).trim();
  if (airbnbTitle !== airbnbTitleCurrent.trim()) {
    proposals.push({
      channel: "airbnb",
      field: "title",
      current: airbnbTitleCurrent,
      proposed: airbnbTitle,
      reasoning:
        "Airbnb search favors area + bed count + top amenities in the first 50 characters.",
      visibilityDelta: 12,
      risk: "low",
    });
  }

  const airbnbSummaryCurrent = channels.airbnb.summary || "";
  if (airbnbSummaryCurrent.length < 120) {
    const summary = [
      `Stay in ${area} — ${beds}-bedroom home with ${amenityBit}.`,
      `Ideal for Dubai visitors who want walkable dining and quick access to the beach or metro.`,
      `Book direct for flexible check-in and responsive host support.`,
    ].join(" ");
    proposals.push({
      channel: "airbnb",
      field: "summary",
      current: airbnbSummaryCurrent,
      proposed: summary.slice(0, 500),
      reasoning: "Airbnb summary under 120 chars — expand with hook, amenities, and guest benefit.",
      visibilityDelta: 10,
      risk: "medium",
    });
  }

  const bookingTitleCurrent = channels.booking_com.title || listing.name;
  const bookingTitle = `${beds}BR ${area} Apartment — ${amenities[0] || "Central Location"}`.slice(
    0,
    80
  );
  if (bookingTitle !== bookingTitleCurrent.trim()) {
    proposals.push({
      channel: "booking_com",
      field: "title",
      current: bookingTitleCurrent,
      proposed: bookingTitle,
      reasoning: "Booking.com guests scan structured titles with bed count and landmark amenities.",
      visibilityDelta: 9,
      risk: "low",
    });
  }

  const bookingDescCurrent = channels.booking_com.description || shared.description;
  if (bookingDescCurrent.length < 200) {
    const lead = [
      `Welcome to your ${beds}-bedroom apartment in ${area}, ${listing.city}.`,
      `Highlights: ${amenityBit}.`,
      `Perfect for business and leisure stays with easy access to Dubai's main districts.`,
    ].join("\n\n");
    proposals.push({
      channel: "booking_com",
      field: "description",
      current: bookingDescCurrent,
      proposed: lead,
      reasoning: "Booking.com ranks listings with informative opening paragraphs and amenity bullets.",
      visibilityDelta: 8,
      risk: "medium",
    });
  }

  return proposals;
}

export async function runListingOptimizer(opts: {
  orgId: mongoose.Types.ObjectId;
  listingId: mongoose.Types.ObjectId;
}): Promise<OptimizerResult> {
  const { orgId, listingId } = opts;
  await connectDB();

  const [listing, snapshot, channelMix] = await Promise.all([
    Listing.findOne({ _id: listingId, orgId }).lean(),
    ListingContentSnapshot.findOne({ orgId, listingId }).lean(),
    getChannelMix(orgId, listingId),
  ]);

  if (!listing) throw new Error("Listing not found");
  if (!snapshot) {
    throw new Error("No content snapshot — sync from Hostaway first");
  }

  const scores = scoreListingVisibility(snapshot.channels, snapshot.shared);

  const lyzrPrompt = JSON.stringify(
    {
      listing: {
        name: listing.name,
        area: listing.area,
        city: listing.city,
        bedroomsNumber: listing.bedroomsNumber,
        amenities: snapshot.shared.amenities,
      },
      content_snapshot: snapshot.channels,
      channel_mix: channelMix,
      visibility_scores: scores,
      instructions:
        "Return JSON only: { audit: { overall_visibility_score, by_channel }, proposals: [{ channel, field, current, proposed, reasoning, visibility_delta, risk }] }. Optimize for each OTA's search behavior. Airbnb title max 50 chars.",
    },
    null,
    2
  );

  const lyzr = await callLyzrOptimizer(lyzrPrompt);
  if (lyzr && lyzr.proposals.length > 0) {
    if (!lyzr.audit.overall) {
      lyzr.audit.overall = scores.overall;
      lyzr.audit.byChannel = scores.byChannel;
    }
    return lyzr;
  }

  const proposals = buildRulesProposals(listing, {
    channels: snapshot.channels,
    shared: snapshot.shared,
  });

  const after = { ...snapshot.channels };
  for (const p of proposals) {
    if (p.channel === "airbnb" && p.field === "title") after.airbnb.title = p.proposed;
    if (p.channel === "airbnb" && p.field === "summary") after.airbnb.summary = p.proposed;
    if (p.channel === "booking_com" && p.field === "title") after.booking_com.title = p.proposed;
    if (p.channel === "booking_com" && p.field === "description") {
      after.booking_com.description = p.proposed;
    }
  }
  const projected = scoreListingVisibility(after, snapshot.shared);

  return {
    source: "rules",
    audit: {
      overall: projected.overall,
      byChannel: projected.byChannel,
    },
    proposals,
  };
}

// Re-export for score delta on individual proposals
export function estimateProposalDelta(
  channel: ContentChannel,
  field: ContentField,
  snapshot: IListingContentSnapshot,
  proposed: string
): number {
  const channels = JSON.parse(JSON.stringify(snapshot.channels)) as IListingContentSnapshot["channels"];
  if (channel === "airbnb") {
    if (field === "title") channels.airbnb.title = proposed;
    if (field === "summary") channels.airbnb.summary = proposed;
  } else if (channel === "booking_com") {
    if (field === "title") channels.booking_com.title = proposed;
    if (field === "description") channels.booking_com.description = proposed;
  } else if (channel === "vrbo" && field === "headline") {
    channels.vrbo.headline = proposed;
  }
  const before = scoreChannelContent(channel, snapshot.channels, snapshot.shared);
  const after = scoreChannelContent(channel, channels, snapshot.shared);
  return Math.max(0, after - before);
}
import type { ContentChannel, ListingContentChannels, ListingContentShared } from "./types";

const CHANNEL_TITLE_BOUNDS: Record<string, { min: number; max: number }> = {
  airbnb: { min: 35, max: 50 },
  booking_com: { min: 40, max: 80 },
  vrbo: { min: 40, max: 80 },
};

const KEYWORD_HINTS = [
  "wifi",
  "pool",
  "view",
  "marina",
  "downtown",
  "beach",
  "gym",
  "parking",
  "kitchen",
];

function titleScore(text: string, channel: ContentChannel): number {
  const t = text.trim();
  if (!t) return 0;
  const bounds = CHANNEL_TITLE_BOUNDS[channel];
  if (!bounds) return 50;
  const len = t.length;
  if (len >= bounds.min && len <= bounds.max) return 100;
  if (len < bounds.min) return Math.max(20, (len / bounds.min) * 80);
  return Math.max(30, 100 - (len - bounds.max) * 2);
}

function keywordScore(...texts: string[]): number {
  const blob = texts.join(" ").toLowerCase();
  const hits = KEYWORD_HINTS.filter((k) => blob.includes(k)).length;
  return Math.min(100, 40 + hits * 12);
}

function amenityScore(amenities: string[]): number {
  if (!amenities.length) return 20;
  const n = amenities.length;
  if (n >= 8) return 100;
  if (n >= 5) return 75;
  return 50;
}

function descriptionScore(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  if (t.length < 120) return 45;
  if (t.length < 400) return 70;
  return 90;
}

export function scoreChannelContent(
  channel: ContentChannel,
  channels: ListingContentChannels,
  shared: ListingContentShared
): number {
  if (channel === "all") return 0;
  const c = channels[channel];
  const parts: number[] = [];

  if (channel === "airbnb") {
    parts.push(titleScore(c.title || "", "airbnb") * 0.35);
    parts.push(descriptionScore(c.summary || "") * 0.25);
    parts.push(keywordScore(c.title || "", c.summary || "", shared.description) * 0.25);
    parts.push((c.summary ? 100 : 0) * 0.15);
  } else if (channel === "booking_com") {
    parts.push(titleScore(c.title || "", "booking_com") * 0.3);
    parts.push(descriptionScore(c.description || shared.description) * 0.35);
    parts.push(keywordScore(c.title || "", c.description || shared.description) * 0.2);
    parts.push(amenityScore(shared.amenities) * 0.15);
  } else if (channel === "vrbo") {
    parts.push(titleScore(c.headline || c.title || "", "vrbo") * 0.35);
    parts.push(descriptionScore(c.description || shared.description) * 0.35);
    parts.push(keywordScore(c.headline || "", shared.description) * 0.3);
  }

  return Math.round(parts.reduce((a, b) => a + b, 0));
}

export function scoreListingVisibility(
  channels: ListingContentChannels,
  shared: ListingContentShared
): { overall: number; byChannel: Partial<Record<ContentChannel, number>> } {
  const airbnb = scoreChannelContent("airbnb", channels, shared);
  const booking = scoreChannelContent("booking_com", channels, shared);
  const vrbo = scoreChannelContent("vrbo", channels, shared);
  const overall = Math.round((airbnb + booking + vrbo) / 3);
  return {
    overall,
    byChannel: { airbnb, booking_com: booking, vrbo },
  };
}
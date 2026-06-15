/**
 * Auto-detect when DTCM / Dubai Calendar feeds should run.
 * Requires: Dubai-market org + live PMS data (Hostaway-connected listings).
 */

import mongoose from "mongoose";
import { connectDB, Organization, Listing } from "@/lib/db";

const DUBAI_MARKET_CODES = new Set(["UAE_DXB", "DXB", "DUBAI"]);
const UAE_COUNTRY = new Set(["AE", "UAE", "ARE"]);

export interface DtcmEligibility {
  enabled: boolean;
  isDubaiMarket: boolean;
  pmsConnected: boolean;
  hasApiKey: boolean;
  dubaiListingCount: number;
  reason: string;
}

function isDubaiCity(city?: string | null): boolean {
  if (!city) return false;
  const c = city.toLowerCase().trim();
  return c.includes("dubai") || c === "dxb";
}

function isUaeCountry(code?: string | null): boolean {
  if (!code) return false;
  return UAE_COUNTRY.has(code.toUpperCase().trim());
}

export function isDubaiListing(listing: {
  city?: string | null;
  countryCode?: string | null;
  area?: string | null;
}): boolean {
  if (isDubaiCity(listing.city)) return true;
  if (isUaeCountry(listing.countryCode) && isDubaiCity(listing.area)) return true;
  return false;
}

export function isDubaiOrganization(org: {
  marketCode?: string | null;
  currency?: string | null;
  timezone?: string | null;
}): boolean {
  const code = (org.marketCode || "").toUpperCase();
  if (DUBAI_MARKET_CODES.has(code)) return true;
  if (org.currency === "AED" && org.timezone === "Asia/Dubai") return true;
  return false;
}

/** PMS is connected when org has Hostaway credentials or synced listings with hostawayId. */
export function isPmsConnected(
  org: { hostawayApiKey?: string | null; hostawayAccountId?: string | null },
  listings: Array<{ hostawayId?: string | null }>
): boolean {
  if (org.hostawayApiKey?.trim()) return true;
  if (org.hostawayAccountId?.trim()) return true;

  const linked = listings.filter((l) => l.hostawayId?.trim()).length;
  if (linked > 0) return true;

  const globalLive =
    (process.env.HOSTAWAY_MODE || "db").toLowerCase() === "live" &&
    Boolean(process.env.HOSTAWAY_API_KEY || process.env.Hostaway_Authorization_token);
  return globalLive && listings.length > 0;
}

export async function resolveDtcmEligibility(
  orgId: mongoose.Types.ObjectId | string
): Promise<DtcmEligibility> {
  await connectDB();
  const oid = typeof orgId === "string" ? new mongoose.Types.ObjectId(orgId) : orgId;

  const [org, listings] = await Promise.all([
    Organization.findById(oid)
      .select("marketCode currency timezone hostawayApiKey hostawayAccountId")
      .lean(),
    Listing.find({ orgId: oid })
      .select("city countryCode area hostawayId")
      .lean(),
  ]);

  if (!org) {
    return {
      enabled: false,
      isDubaiMarket: false,
      pmsConnected: false,
      hasApiKey: false,
      dubaiListingCount: 0,
      reason: "organization not found",
    };
  }

  const dubaiListings = listings.filter(isDubaiListing);
  const isDubaiMarket =
    isDubaiOrganization(org) || dubaiListings.length > 0 || listings.every(isDubaiListing);
  const pmsConnected = isPmsConnected(org, listings);
  const hasApiKey = Boolean(
    process.env.DUBAI_GOV_API_KEY?.trim() ||
    process.env.DTCM_API_KEY?.trim() ||
    process.env.DTCM_SUBSCRIPTION_KEY?.trim()
  );

  let enabled = isDubaiMarket && pmsConnected;
  let reason: string;

  if (!isDubaiMarket) {
    reason = "not a Dubai-market org (no UAE/Dubai listings)";
    enabled = false;
  } else if (!pmsConnected) {
    reason = "PMS not connected — connect Hostaway to enable DTCM calendar";
    enabled = false;
  } else if (hasApiKey) {
    reason = "Dubai + PMS connected — live DTCM + DCUL feeds enabled";
  } else {
    reason = "Dubai + PMS connected — curated DTCM calendar (set DUBAI_GOV_API_KEY for live API)";
  }

  return {
    enabled,
    isDubaiMarket,
    pmsConnected,
    hasApiKey,
    dubaiListingCount: dubaiListings.length || (isDubaiMarket ? listings.length : 0),
    reason,
  };
}
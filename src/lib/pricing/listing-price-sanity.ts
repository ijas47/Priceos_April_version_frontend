import { subDays, format } from "date-fns";
import { resolveDisplayRate } from "@/lib/pricing/display-rate";
import type { DemandRegime } from "@/lib/pricing/demand-regime";
import { resolveDayCalendarPrice } from "@/lib/engine/calendar-rates";

export type BasePriceSource = "history_1y" | "benchmark" | "hostaway";

/** Common Hostaway / PMS default round numbers. */
export const PLACEHOLDER_ROUND_PRICES = [
  50, 75, 100, 150, 200, 250, 300, 500, 750, 1000, 1500, 2000, 9999, 99999,
] as const;

export const LISTED_PRICE_DEVIATION_THRESHOLD = 0.4;

export interface ListingPriceSanityInput {
  listedPrice: number;
  calendarPrices?: number[];
  /** Trailing 12-month achieved ADR from reservations. */
  ttmAdr?: number | null;
  ttmReservationCount?: number;
  /** Market benchmark (monthly p50 or annual p50). */
  marketP50?: number | null;
  /** When distressed/soft, do not override low listed prices with historical medians. */
  demandRegime?: DemandRegime;
}

export interface ListingPriceSanityResult {
  source: BasePriceSource;
  trustedBasePrice: number;
  confidencePct: number;
  sampleSize: number;
  pmsPriceTrusted: boolean;
  isPlaceholder: boolean;
  flags: string[];
  listedReference: number;
  referencePrice: number | null;
  deviationPct: number | null;
}

export function isFlatCalendar(calendarPrices: number[]): boolean {
  const positive = calendarPrices.filter((p) => p > 0);
  if (positive.length === 0) return false;
  const unique = new Set(positive.map((p) => Math.round(p)));
  return unique.size <= 1;
}

export function isRoundPlaceholderPrice(price: number): boolean {
  const rounded = Math.round(price);
  return (PLACEHOLDER_ROUND_PRICES as readonly number[]).includes(rounded);
}

export function computePriceDeviationPct(listed: number, reference: number): number | null {
  if (listed <= 0 || reference <= 0) return null;
  return Math.abs(listed - reference) / reference;
}

export function computeTtmAdr(
  reservations: Array<{ totalPrice?: number | null; nights?: number | null }>
): { adr: number | null; count: number } {
  const entries = reservations
    .filter((r) => Number(r.totalPrice) > 0 && Number(r.nights) > 0)
    .map((r) => Number(r.totalPrice) / Number(r.nights));

  if (entries.length === 0) return { adr: null, count: 0 };
  const adr = Math.round(
    (entries.reduce((s, v) => s + v, 0) / entries.length) * 100
  ) / 100;
  return { adr, count: entries.length };
}

/**
 * Assess whether the PMS listed price is trustworthy or a placeholder default.
 * Prefers achieved ADR, then market benchmark, then Hostaway fallback.
 */
export function assessListingPriceSanity(
  input: ListingPriceSanityInput
): ListingPriceSanityResult {
  const listedPrice = Math.max(0, Number(input.listedPrice) || 0);
  const calendarPrices = input.calendarPrices ?? [];
  const rateDisplay = resolveDisplayRate({
    listedPrice,
    calendarPrices,
  });

  const listedReference = rateDisplay.listedPrice > 0 ? rateDisplay.listedPrice : listedPrice;
  const flatCalendar = isFlatCalendar(calendarPrices);
  const flags: string[] = [];

  if (flatCalendar) flags.push("flat_calendar");
  if (isRoundPlaceholderPrice(listedReference)) flags.push("round_placeholder");

  const ttmCount = input.ttmReservationCount ?? 0;
  const ttmAdr = input.ttmAdr ?? null;
  const marketP50 = input.marketP50 ?? null;

  let source: BasePriceSource = "hostaway";
  let referencePrice: number | null = null;
  let sampleSize = 0;
  let confidencePct = 25;

  if (ttmAdr && ttmAdr > 0 && ttmCount >= 3) {
    source = "history_1y";
    referencePrice = Math.round(ttmAdr);
    sampleSize = ttmCount;
    confidencePct = Math.min(95, 55 + ttmCount * 4);
  } else if (marketP50 && marketP50 > 0) {
    source = "benchmark";
    referencePrice = Math.round(marketP50);
    sampleSize = 1;
    confidencePct = 72;
  } else if (listedReference > 0 && !flatCalendar && calendarPrices.length >= 14) {
    source = "hostaway";
    referencePrice = listedReference;
    sampleSize = calendarPrices.filter((p) => p > 0).length;
    confidencePct = 45;
  }

  const deviationPct = referencePrice
    ? computePriceDeviationPct(listedReference, referencePrice)
    : null;

  const significantDeviation =
    deviationPct != null && deviationPct > LISTED_PRICE_DEVIATION_THRESHOLD;

  let isPlaceholder =
    referencePrice != null &&
    significantDeviation &&
    (flatCalendar || isRoundPlaceholderPrice(listedReference) || source !== "hostaway");

  let trustedBasePrice = listedReference > 0 ? listedReference : referencePrice ?? 0;
  let pmsPriceTrusted = true;

  const distressedDemand =
    input.demandRegime === "distressed" || input.demandRegime === "soft";

  if (distressedDemand && isPlaceholder) {
    trustedBasePrice = listedReference > 0 ? listedReference : trustedBasePrice;
    pmsPriceTrusted = true;
    source = "hostaway";
    confidencePct = 55;
    flags.push("distressed_demand_trust_listed");
    isPlaceholder = false;
  } else if (isPlaceholder && referencePrice) {
    trustedBasePrice = referencePrice;
    pmsPriceTrusted = false;
    flags.push("pms_price_unreliable");
  } else if (source === "history_1y" && referencePrice) {
    trustedBasePrice = referencePrice;
    pmsPriceTrusted = deviationPct == null || deviationPct <= 0.15;
    if (!pmsPriceTrusted) flags.push("listed_deviates_from_history");
  } else if (source === "benchmark" && referencePrice && significantDeviation) {
    trustedBasePrice = referencePrice;
    pmsPriceTrusted = false;
    flags.push("listed_deviates_from_market");
  } else if (flatCalendar && listedReference > 0 && !referencePrice) {
    pmsPriceTrusted = false;
    confidencePct = 10;
    flags.push("flat_calendar_no_benchmark");
  } else if (source === "hostaway") {
    pmsPriceTrusted = !flatCalendar || confidencePct >= 40;
    if (flatCalendar && isRoundPlaceholderPrice(listedReference)) {
      pmsPriceTrusted = false;
      confidencePct = 5;
    }
  }

  if (trustedBasePrice <= 0 && referencePrice) {
    trustedBasePrice = referencePrice;
  }

  return {
    source,
    trustedBasePrice,
    confidencePct,
    sampleSize,
    pmsPriceTrusted,
    isPlaceholder,
    flags,
    listedReference,
    referencePrice,
    deviationPct: deviationPct != null ? Math.round(deviationPct * 1000) / 10 : null,
  };
}

/**
 * Per-day listed reference for the pricing waterfall when PMS price may be wrong.
 */
export function resolvePipelineListedPrice(params: {
  date: string;
  calendarPriceByDate: Map<string, number>;
  listingFallbackPrice: number;
  validatedBasePrice?: number | null;
  pmsPriceTrusted?: boolean;
}): number {
  const fallback =
    params.validatedBasePrice && params.validatedBasePrice > 0
      ? params.validatedBasePrice
      : params.listingFallbackPrice;

  if (params.pmsPriceTrusted !== false) {
    return resolveDayCalendarPrice(
      params.date,
      params.calendarPriceByDate,
      params.listingFallbackPrice
    );
  }

  const calendarPrices = [...params.calendarPriceByDate.values()];
  if (isFlatCalendar(calendarPrices)) {
    return fallback;
  }

  const dayPrice = params.calendarPriceByDate.get(params.date);
  if (dayPrice && dayPrice > 0 && fallback > 0) {
    const dev = Math.abs(dayPrice - fallback) / fallback;
    if (dev <= 0.25) return dayPrice;
  }

  return fallback > 0 ? fallback : resolveDayCalendarPrice(
    params.date,
    params.calendarPriceByDate,
    params.listingFallbackPrice
  );
}

export function buildListingPriceSanityInsightCopy(
  listingName: string,
  result: ListingPriceSanityResult,
  currencyCode: string
): { title: string; summary: string; severity: "high" | "medium" | "low" } {
  const cur = currencyCode || "AED";
  const ref =
    result.referencePrice != null
      ? `${result.referencePrice.toLocaleString("en-US")} ${cur}`
      : "unknown";
  const listed = `${result.listedReference.toLocaleString("en-US")} ${cur}`;
  const trusted = `${result.trustedBasePrice.toLocaleString("en-US")} ${cur}`;

  if (result.isPlaceholder) {
    return {
      severity: "high",
      title: `PMS price looks like a placeholder — ${listingName}`,
      summary: `Hostaway shows ${listed} but ${
        result.source === "history_1y" ? "booking history" : "market benchmark"
      } suggests ${ref} (${result.deviationPct?.toFixed(0) ?? "?"}% off). Engine is using ${trusted} as base until you confirm pricing in Hostaway.`,
    };
  }

  if (!result.pmsPriceTrusted) {
    return {
      severity: "medium",
      title: `Listed price may be inaccurate — ${listingName}`,
      summary: `PMS listed rate (${listed}) diverges from ${
        result.source === "history_1y" ? "achieved ADR" : "market p50"
      } (${ref}). Proposals use ${trusted} as the trusted base.`,
    };
  }

  return {
    severity: "low",
    title: `Base price validated — ${listingName}`,
    summary: `Listed rate ${listed} aligns with ${
      result.source === "hostaway" ? "synced calendar" : result.source
    } (confidence ${result.confidencePct}%).`,
  };
}

/** TTM window for achieved ADR (days). */
export const TTM_LOOKBACK_DAYS = 365;

export function ttmCutoffDate(from: Date = new Date()): string {
  return format(subDays(from, TTM_LOOKBACK_DAYS), "yyyy-MM-dd");
}
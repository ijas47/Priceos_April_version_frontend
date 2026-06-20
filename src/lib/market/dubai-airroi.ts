import {
  DubaiCompListing,
  DubaiMarketMeta,
  DubaiMarketMonthly,
} from "@/lib/db";
import {
  percentilesFromRates,
  type CompSetPercentiles,
} from "@/lib/pricing/market-anchor";
import {
  resolveAreaBounds,
  type GeoBounds,
} from "@/lib/pricing/area-bounds";
import type { MarketSignal } from "@/lib/engine/waterfall";

export const DUBAI_AIRROI_SOURCE_VERSION = "jasonairroi/airbnb-short-term-rental-data-dubai:v3";

const AREA_ALIASES: Record<string, string[]> = {
  "dubai marina": ["dubai marina", "marina"],
  jbr: ["jbr", "jumeirah beach residence", "jumeirah beach"],
  "downtown dubai": ["downtown dubai", "downtown", "business bay"],
  "business bay": ["business bay", "downtown dubai"],
  "palm jumeirah": ["palm jumeirah", "palm"],
  jvc: ["jvc", "jumeirah village circle", "jumeirah village"],
  "dubai hills": ["dubai hills", "dubai hills estate"],
  "city walk": ["city walk"],
};

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isDubaiMarket(city: string, countryCode: string): boolean {
  const c = norm(city);
  const cc = countryCode.trim().toUpperCase();
  return (
    (c === "dubai" || c.startsWith("dubai,")) &&
    (cc === "AE" || cc === "UAE" || cc === "ARE")
  );
}

/** Resolve area keys to query pre-aggregated monthly stats (most specific first). */
export function resolveDubaiAreaKeys(area: string, city: string): string[] {
  if (!isDubaiMarket(city, "AE")) return [];

  const key = norm(area);
  if (!key || key === "dubai" || key === "dubai uae") {
    return ["dubai_city"];
  }

  const keys: string[] = [];
  for (const [areaKey, aliases] of Object.entries(AREA_ALIASES)) {
    if (aliases.some((a) => key === a || key.includes(a))) {
      keys.push(areaKey);
    }
  }
  if (keys.length === 0) {
    keys.push(key);
  }
  keys.push("dubai_city");
  return [...new Set(keys)];
}

function listingInBounds(
  lat: number,
  lng: number,
  bounds: GeoBounds
): boolean {
  return (
    lat >= bounds.sw_lat &&
    lat <= bounds.ne_lat &&
    lng >= bounds.sw_lng &&
    lng <= bounds.ne_lng
  );
}

export async function isDubaiDatasetReady(): Promise<boolean> {
  const meta = await DubaiMarketMeta.findOne({ source: "airroi_dubai_kaggle" })
    .sort({ ingestedAt: -1 })
    .select("_id")
    .lean();
  return !!meta;
}

/** Comp-set percentiles from ingested Dubai listings (geo bounds + bedrooms). */
export async function resolveDubaiCompSetPercentiles(
  bounds: GeoBounds,
  bedrooms: number
): Promise<CompSetPercentiles> {
  const br = Math.round(bedrooms);
  const listings = await DubaiCompListing.find({
    bedrooms: br,
    latitude: { $gte: bounds.sw_lat, $lte: bounds.ne_lat },
    longitude: { $gte: bounds.sw_lng, $lte: bounds.ne_lng },
    ttmAvgRate: { $gt: 0 },
  })
    .select("ttmAvgRate l90dAvgRate")
    .lean();

  const rates = listings
    .map((l) => Number(l.l90dAvgRate ?? l.ttmAvgRate ?? 0))
    .filter((r) => r > 0);

  if (rates.length < 3) {
    return {
      p25: null,
      p50: null,
      p75: null,
      count: rates.length,
      source: "dubai_airroi_comps",
    };
  }

  return {
    ...percentilesFromRates(rates),
    source: "dubai_airroi_comps",
  };
}

interface MonthlyRow {
  month: string;
  p25Adr: number;
  p50Adr: number;
  p75Adr: number;
  avgOccupancy: number;
  listingCount: number;
}

async function loadMonthlyForArea(
  areaKeys: string[],
  bedrooms: number
): Promise<Map<string, MonthlyRow>> {
  const map = new Map<string, MonthlyRow>();
  const br = Math.round(bedrooms);

  for (const areaKey of areaKeys) {
    const docs = await DubaiMarketMonthly.find({ areaKey, bedrooms: br })
      .sort({ month: 1 })
      .lean();
    if (docs.length === 0) continue;

    for (const doc of docs) {
      map.set(doc.month, {
        month: doc.month,
        p25Adr: doc.p25Adr,
        p50Adr: doc.p50Adr,
        p75Adr: doc.p75Adr,
        avgOccupancy: doc.avgOccupancy,
        listingCount: doc.listingCount,
      });
    }
    return map;
  }

  return map;
}

function shiftMonthYm(ym: string, yearDelta: number): string {
  const [y, m] = ym.split("-").map(Number);
  return `${y + yearDelta}-${String(m).padStart(2, "0")}`;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function dateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

export interface DubaiMarketContext {
  compPercentiles: CompSetPercentiles;
  monthlyByYm: Map<string, MonthlyRow>;
  latestMonth?: MonthlyRow;
  activeListings: number;
  marketOccupancy: number | null;
  annualP50: number | null;
}

export async function buildDubaiMarketContext(
  area: string,
  city: string,
  bedrooms: number
): Promise<DubaiMarketContext | null> {
  if (!isDubaiMarket(city, "AE")) return null;
  if (!(await isDubaiDatasetReady())) return null;

  const bounds = resolveAreaBounds(area, city);
  if (!bounds) return null;

  const br = Math.round(bedrooms);
  const areaKeys = resolveDubaiAreaKeys(area, city);
  const [compPercentiles, monthlyByYm] = await Promise.all([
    resolveDubaiCompSetPercentiles(bounds, br),
    loadMonthlyForArea(areaKeys, br),
  ]);

  const months = [...monthlyByYm.keys()].sort();
  const latestYm = months.at(-1);
  const latestMonth = latestYm ? monthlyByYm.get(latestYm) : undefined;

  const listingCount = await DubaiCompListing.countDocuments({
    bedrooms: br,
    latitude: { $gte: bounds.sw_lat, $lte: bounds.ne_lat },
    longitude: { $gte: bounds.sw_lng, $lte: bounds.ne_lng },
  });

  const annualP50 =
    latestMonth?.p50Adr ??
    compPercentiles.p50 ??
    null;

  return {
    compPercentiles,
    monthlyByYm,
    latestMonth,
    activeListings: listingCount,
    marketOccupancy: latestMonth?.avgOccupancy ?? null,
    annualP50,
  };
}

/**
 * Build per-day market signals from Dubai open data.
 * Seasonal anchors (month p50, comp percentiles) are primary for UAE.
 * forwardOccupancy / pacingAdr here are static fallbacks — live values come from Airbtics when configured.
 */
export async function buildDubaiMarketSignals(
  area: string,
  city: string,
  bedrooms: number,
  startDate: Date,
  days: number
): Promise<Map<string, MarketSignal>> {
  const map = new Map<string, MarketSignal>();
  const ctx = await buildDubaiMarketContext(area, city, bedrooms);
  if (!ctx) return map;

  const { compPercentiles, monthlyByYm, latestMonth } = ctx;
  const supplyPressure =
    ctx.marketOccupancy != null
      ? Math.max(0, Math.min(1, 1 - ctx.marketOccupancy))
      : undefined;

  for (let i = 0; i < days; i++) {
    const d = addDays(startDate, i);
    const ds = dateStr(d);
    const ym = ds.slice(0, 7);

    const monthRow =
      monthlyByYm.get(ym) ??
      monthlyByYm.get(shiftMonthYm(ym, -1)) ??
      latestMonth;

    const pacingYm = shiftMonthYm(ym, -1);
    const pacingRow = monthlyByYm.get(pacingYm) ?? monthRow;

    const signal: MarketSignal = {};

    // Month-specific comp percentiles drive seasonal base (Dubai 100 vs 1000 swing).
    const monthP50 = monthRow?.p50Adr;
    const compP50 = monthP50 ?? compPercentiles.p50;
    if (compP50 && compP50 > 0) {
      signal.compSetP50 = compP50;
      signal.compSetP25 = monthRow?.p25Adr ?? compPercentiles.p25 ?? undefined;
      signal.compSetP75 = monthRow?.p75Adr ?? compPercentiles.p75 ?? undefined;
      signal.compSetSource = monthP50 ? "dubai_airroi_monthly" : compPercentiles.source;
    }

    if (monthP50) signal.monthAnchorAdr = monthP50;
    if (ctx.annualP50) signal.annualAnchorAdr = ctx.annualP50;

    if (pacingRow?.avgOccupancy != null) {
      signal.forwardOccupancy = pacingRow.avgOccupancy;
    }
    if (pacingRow?.p50Adr) signal.pacingAdr = pacingRow.p50Adr;

    if (ctx.marketOccupancy != null) signal.marketOccupancy = ctx.marketOccupancy;
    if (ctx.activeListings > 0) signal.activeListings = ctx.activeListings;
    if (supplyPressure != null) signal.supplyPressure = supplyPressure;

    if (Object.keys(signal).length > 0) map.set(ds, signal);
  }

  return map;
}

/**
 * Field ownership when merging Dubai local data + Airbtics API.
 *
 * 1. Dubai (local Kaggle ingest): monthAnchorAdr, comp percentiles — seasonal anchors for UAE demos.
 * 2. Airbtics (when API key set): forwardOccupancy, pacingAdr, live market occupancy — forward demand.
 * 3. Dubai pacing fields are fallback only when Airbtics is unavailable or missing a date.
 */
export const DUBAI_PRIMARY_SIGNAL_FIELDS = [
  "compSetP25",
  "compSetP50",
  "compSetP75",
  "compSetSource",
  "monthAnchorAdr",
  "annualAnchorAdr",
] as const;

export const AIRBTICS_LIVE_SIGNAL_FIELDS = [
  "forwardOccupancy",
  "pacingAdr",
  "marketOccupancy",
  "activeListings",
  "supplyPressure",
] as const;

export interface MergeMarketSignalsOptions {
  /** AIRBTICS_API_KEY set and at least one day of Airbtics signals loaded. */
  airbticsLive?: boolean;
}

/** True when the map contains per-day forward pacing from Airbtics. */
export function hasAirbticsPacingData(map: Map<string, MarketSignal>): boolean {
  for (const signal of map.values()) {
    if (
      (signal.forwardOccupancy != null && signal.forwardOccupancy > 0) ||
      (signal.pacingAdr != null && signal.pacingAdr > 0)
    ) {
      return true;
    }
  }
  return false;
}

export function mergeMarketSignals(
  dubai: Map<string, MarketSignal>,
  airbtics: Map<string, MarketSignal>,
  options?: MergeMarketSignalsOptions
): Map<string, MarketSignal> {
  const airbticsLive = options?.airbticsLive ?? false;
  const merged = new Map<string, MarketSignal>(airbtics);

  const allDates = new Set([...dubai.keys(), ...airbtics.keys()]);
  for (const ds of allDates) {
    const dSignal = dubai.get(ds) ?? {};
    const aSignal = airbtics.get(ds) ?? {};

    const preferAirbticsLive = (field: keyof MarketSignal) => {
      const aVal = aSignal[field];
      const dVal = dSignal[field];
      if (airbticsLive && aVal != null) return aVal;
      return dVal ?? aVal;
    };

    merged.set(ds, {
      ...aSignal,
      ...dSignal,
      compSetP50: dSignal.compSetP50 ?? aSignal.compSetP50,
      compSetP25: dSignal.compSetP25 ?? aSignal.compSetP25,
      compSetP75: dSignal.compSetP75 ?? aSignal.compSetP75,
      compSetSource: dSignal.compSetSource ?? aSignal.compSetSource,
      monthAnchorAdr: dSignal.monthAnchorAdr ?? aSignal.monthAnchorAdr,
      annualAnchorAdr: dSignal.annualAnchorAdr ?? aSignal.annualAnchorAdr,
      forwardOccupancy: preferAirbticsLive("forwardOccupancy") as number | undefined,
      pacingAdr: preferAirbticsLive("pacingAdr") as number | undefined,
      marketOccupancy: preferAirbticsLive("marketOccupancy") as number | undefined,
      activeListings: preferAirbticsLive("activeListings") as number | undefined,
      supplyPressure: preferAirbticsLive("supplyPressure") as number | undefined,
    });
  }

  return merged;
}
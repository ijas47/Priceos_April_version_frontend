/**
 * Market Bootstrap — enrich regional pricing packs from verified signals.
 *
 * Trust ladder:
 *   1. Hand-tuned UAE PriceLabs pack (never overwritten)
 *   2. Cached bootstrap on MarketTemplate (< 90 days)
 *   3. Airbtics monthly ADR curve (when API key + market match)
 *   4. MarketTemplate seasonal patterns (deterministic compose)
 */

import { connectDB, MarketTemplate } from "@/lib/db";
import { MARKET_TEMPLATES_SEED } from "@/lib/db/seed/market-templates";
import type { ISeasonalPattern } from "@/lib/db/models/MarketTemplate";
import { getMarketContext, resolveMarketId } from "@/lib/airbtics/market-context";
import type { MonthlyMetric } from "@/lib/airbtics/client";
import { UAE_PRICELABS_DEFAULTS } from "@/lib/pricing/uae-pricelabs-defaults";
import type { MarketPricingPack } from "@/lib/pricing/types";
import { composePricingPackFromTemplate, buildSeasonalSegments } from "./compose-pricing-pack";
import { getMarketEntry } from "./market-registry";
import { validatePricingPack } from "./validate-pricing-pack";

const CACHE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

type TemplateLike = Parameters<typeof composePricingPackFromTemplate>[0];

function isPackFresh(generatedAt?: Date | string | null): boolean {
  if (!generatedAt) return false;
  const ts = new Date(generatedAt).getTime();
  return Date.now() - ts < CACHE_MAX_AGE_MS;
}

/** Convert Airbtics monthly ADR into 12-month seasonal patterns. */
export function patternsFromAirbticsMetrics(metrics: MonthlyMetric[]): ISeasonalPattern[] | null {
  const withAdr = metrics.filter((m) => m.month && m.p50_adr && m.p50_adr > 0);
  if (withAdr.length < 6) return null;

  const adrs = withAdr.map((m) => m.p50_adr!);
  const annual = adrs.reduce((a, b) => a + b, 0) / adrs.length;

  return withAdr.map((m) => {
    const monthNum = parseInt(m.month!.split("-")[1], 10);
    const premium = Math.round(((m.p50_adr! / annual) - 1) * 100);
    const clamped = Math.max(-35, Math.min(45, premium));
    return {
      month: monthNum,
      demandScore: Math.min(100, Math.max(10, 50 + clamped)),
      ratePremiumPct: clamped,
      notes: m.occupancy != null ? `Airbtics occ ${Math.round(m.occupancy)}%` : "Airbtics ADR",
    };
  });
}

/** Blend template patterns with Airbtics (70% signal / 30% template when both exist). */
export function blendSeasonalPatterns(
  templatePatterns: ISeasonalPattern[],
  airbticsPatterns: ISeasonalPattern[]
): ISeasonalPattern[] {
  const byMonth = new Map<number, ISeasonalPattern>();
  for (const p of templatePatterns) {
    byMonth.set(p.month, { ...p });
  }
  for (const a of airbticsPatterns) {
    const t = byMonth.get(a.month);
    if (!t) {
      byMonth.set(a.month, a);
      continue;
    }
    byMonth.set(a.month, {
      month: a.month,
      demandScore: Math.round(t.demandScore * 0.3 + a.demandScore * 0.7),
      ratePremiumPct: Math.round(t.ratePremiumPct * 0.3 + a.ratePremiumPct * 0.7),
      notes: a.notes || t.notes,
    });
  }
  return [...byMonth.values()].sort((a, b) => a.month - b.month);
}

function applyPatternsToPack(pack: MarketPricingPack, patterns: ISeasonalPattern[]): MarketPricingPack {
  const calendarId = pack.portfolioDefaults.defaultSeasonalCalendarId;
  const segments = buildSeasonalSegments(patterns);
  return {
    ...pack,
    seasonalCalendars: pack.seasonalCalendars.map((c) =>
      c.id === calendarId ? { ...c, segments } : c
    ),
  };
}

async function loadTemplate(marketCode: string): Promise<TemplateLike | null> {
  await connectDB();
  const doc = await MarketTemplate.findOne({ marketCode, isActive: { $ne: false } }).lean();
  if (doc) return doc;
  return MARKET_TEMPLATES_SEED.find((m) => m.marketCode === marketCode) ?? null;
}

/**
 * Bootstrap (or return cached) pricing pack for a market.
 * UAE always returns the hand-tuned export without DB writes.
 */
export async function bootstrapMarketPricingPack(
  marketCode: string,
  opts?: { force?: boolean }
): Promise<{ pack: MarketPricingPack; sources: string[]; cached: boolean }> {
  if (marketCode === "UAE_DXB") {
    return { pack: UAE_PRICELABS_DEFAULTS, sources: ["uae_pricelabs_export"], cached: true };
  }

  await connectDB();
  const existing = await MarketTemplate.findOne({ marketCode }).lean();

  if (
    !opts?.force &&
    existing?.pricingPack &&
    existing.pricingPackVersion &&
    isPackFresh(existing.pricingPackGeneratedAt)
  ) {
    return {
      pack: existing.pricingPack as unknown as MarketPricingPack,
      sources: existing.bootstrapSources ?? ["cache"],
      cached: true,
    };
  }

  const template = await loadTemplate(marketCode);
  if (!template) {
    throw new Error(`Unknown market: ${marketCode}`);
  }

  const sources: string[] = ["market_template"];
  let patterns = [...(template.seasonalPatterns ?? [])];
  let pack = composePricingPackFromTemplate(template);

  const entry = getMarketEntry(marketCode);
  const city = entry?.displayName.split(",")[0] ?? template.displayName.split(",")[0];
  const countryCode = entry?.countryCodes[0] ?? "";

  const marketId = await resolveMarketId(city, countryCode);
  if (marketId) {
    const ctx = await getMarketContext(marketId, "1");
    const airbticsPatterns = ctx.monthlyMetrics
      ? patternsFromAirbticsMetrics(ctx.monthlyMetrics)
      : null;
    if (airbticsPatterns) {
      patterns = blendSeasonalPatterns(patterns, airbticsPatterns);
      pack = applyPatternsToPack(pack, patterns);
      sources.push("airbtics");
    }
  }

  pack = {
    ...pack,
    version: `2026-06-bootstrap-${marketCode.toLowerCase()}`,
    source: `Bootstrap: ${sources.join(" + ")} (${template.displayName})`,
  };

  const validation = validatePricingPack(pack);
  if (!validation.valid) {
    throw new Error(`Invalid pack: ${validation.errors.join("; ")}`);
  }

  const templateExists = await MarketTemplate.exists({ marketCode });
  if (!templateExists) {
    await MarketTemplate.create(template);
  }

  await MarketTemplate.findOneAndUpdate(
    { marketCode },
    {
      $set: {
        pricingPack: pack,
        pricingPackVersion: pack.version,
        pricingPackGeneratedAt: new Date(),
        bootstrapSources: sources,
        seasonalPatterns: patterns,
      },
    }
  );

  return { pack, sources, cached: false };
}
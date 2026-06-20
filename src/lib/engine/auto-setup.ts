/**
 * Auto-setup engine - generates intelligent pricing defaults for listings
 * based on Airbtics market data + market template patterns.
 *
 * Called during onboarding (and re-callable any time from settings).
 */

import { connectDB, Listing, PricingRule, MarketTemplate } from "@/lib/db";
import { resolveMarketId, getMarketContext } from "@/lib/airbtics/market-context";
import { runPipeline } from "./pipeline";
import { applyPricingPackToOrg } from "@/lib/pricing/apply-defaults";
import {
  type Strategy,
  type StrategyPreset,
  resolveStrategyPreset,
  portfolioGuardrailsFromStrategy,
} from "@/lib/pricing/strategy-presets";
import mongoose from "mongoose";
import { runListingPriceSanity } from "@/lib/pricing/listing-price-sanity-service";

export type { Strategy } from "@/lib/pricing/strategy-presets";
export {
  STRATEGY_PRESETS,
  resolveStrategyPreset,
  portfolioGuardrailsFromStrategy,
} from "@/lib/pricing/strategy-presets";

interface PricingDefaults {
  weekendUpliftPct: number;
  lastMinuteDiscountPct: number;
  farOutMarkupPct: number;
}

interface AutoSetupInput {
  orgId: string;
  listingIds: string[];
  marketCode: string;
  strategy: Strategy;
  pricingDefaults?: PricingDefaults;
  presetOverrides?: Partial<StrategyPreset>;
}

interface ListingSetupResult {
  listingId: string;
  name: string;
  status: "configured" | "failed";
  guardrails?: { floor: number; ceiling: number };
  rulesCreated?: number;
  engineRun?: boolean;
  priceSanity?: {
    source: string;
    trustedBasePrice: number;
    pmsPriceTrusted: boolean;
    insightCreated: boolean;
  };
  error?: string;
}

export interface AutoSetupResult {
  listings: ListingSetupResult[];
  totalConfigured: number;
  totalFailed: number;
  airbticsFed: boolean;
  engineRan: boolean;
}

export async function runAutoSetup(input: AutoSetupInput): Promise<AutoSetupResult> {
  await connectDB();

  const orgOid = new mongoose.Types.ObjectId(input.orgId);

  if (!input.marketCode || input.marketCode === "UAE_DXB") {
    await applyPricingPackToOrg(input.orgId);
  }
  const preset = resolveStrategyPreset(input.strategy, input.presetOverrides);
  const defaults = input.pricingDefaults;

  const template = await MarketTemplate.findOne({ marketCode: input.marketCode }).lean();
  const weekendDays = resolveWeekendDays(template?.weekendDefinition ?? "fri_sat");

  const listings = await Listing.find({
    _id: { $in: input.listingIds.map((id) => new mongoose.Types.ObjectId(id)) },
    orgId: orgOid,
  }).lean();

  // Try Airbtics for market intelligence - per bedroom count
  const bedroomGroups = new Map<number, typeof listings>();
  for (const l of listings) {
    const br = l.bedroomsNumber || 1;
    const group = bedroomGroups.get(br) ?? [];
    group.push(l);
    bedroomGroups.set(br, group);
  }

  const city = listings[0]?.city || "";
  const countryCode = listings[0]?.countryCode || "";
  const marketId = await resolveMarketId(city, countryCode);

  const marketContexts = new Map<number, Awaited<ReturnType<typeof getMarketContext>>>();
  let airbticsFed = false;

  if (marketId) {
    const uniqueBedrooms = [...bedroomGroups.keys()];
    const ctxResults = await Promise.all(
      uniqueBedrooms.map(async (br) => {
        const ctx = await getMarketContext(marketId, br);
        return { br, ctx };
      })
    );
    for (const { br, ctx } of ctxResults) {
      marketContexts.set(br, ctx);
      if (ctx.p50ADR) airbticsFed = true;
    }
  }

  const results: ListingSetupResult[] = [];

  // Configure each listing
  const CONCURRENCY = 5;
  const queue = [...listings];
  const worker = async () => {
    while (queue.length > 0) {
      const listing = queue.shift();
      if (!listing) return;
      try {
        const result = await configureListing(
          listing,
          orgOid,
          preset,
          defaults,
          weekendDays,
          template,
          marketContexts.get(listing.bedroomsNumber || 1) ?? null,
        );
        results.push(result);
      } catch (err) {
        results.push({
          listingId: listing._id.toString(),
          name: listing.name,
          status: "failed",
          error: (err as Error).message,
        });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, listings.length) }, worker));

  // Run pricing engine for all successfully configured listings
  let engineRan = false;
  const configuredIds = results.filter((r) => r.status === "configured").map((r) => r.listingId);
  if (configuredIds.length > 0) {
    const engineQueue = [...configuredIds];
    const engineWorker = async () => {
      while (engineQueue.length > 0) {
        const lid = engineQueue.shift();
        if (!lid) return;
        try {
          await runPipeline(lid, "auto-setup onboarding");
          const r = results.find((x) => x.listingId === lid);
          if (r) r.engineRun = true;
        } catch (err) {
          console.error(`[auto-setup] engine run failed for ${lid}:`, (err as Error).message);
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, configuredIds.length) }, engineWorker),
    );
    engineRan = results.some((r) => r.engineRun);
  }

  return {
    listings: results,
    totalConfigured: results.filter((r) => r.status === "configured").length,
    totalFailed: results.filter((r) => r.status === "failed").length,
    airbticsFed,
    engineRan,
  };
}

async function configureListing(
  listing: any,
  orgOid: mongoose.Types.ObjectId,
  preset: StrategyPreset,
  defaults: PricingDefaults | undefined,
  weekendDays: number[],
  template: any | null,
  marketCtx: Awaited<ReturnType<typeof getMarketContext>> | null,
): Promise<ListingSetupResult> {
  const lid = listing._id as mongoose.Types.ObjectId;
  const listedPrice = Number(listing.price) || 0;
  if (listedPrice <= 0) {
    return { listingId: lid.toString(), name: listing.name, status: "failed", error: "No base price" };
  }

  const sanity = await runListingPriceSanity({
    listingId: lid.toString(),
    orgId: orgOid.toString(),
    marketCtx,
  });
  const basePrice = sanity.result.trustedBasePrice > 0 ? sanity.result.trustedBasePrice : listedPrice;

  // Guardrails: prefer Airbtics ADR percentiles if available
  let floor: number;
  let ceiling: number;
  let guardrailsSource: "ai" | "market_template" = "market_template";

  if (marketCtx?.monthlyMetrics && marketCtx.monthlyMetrics.length > 0) {
    const allP25 = marketCtx.monthlyMetrics.map((m) => m.p25_adr).filter(Boolean) as number[];
    const allP75 = marketCtx.monthlyMetrics.map((m) => m.p75_adr).filter(Boolean) as number[];

    if (allP25.length > 0 && allP75.length > 0) {
      const minP25 = Math.min(...allP25);
      const maxP75 = Math.max(...allP75);
      floor = Math.round(minP25 * 0.85);
      ceiling = Math.round(maxP75 * 1.3);
      guardrailsSource = "ai";
    } else {
      floor = Math.round(basePrice * preset.floorMult);
      ceiling = Math.round(basePrice * preset.ceilingMult);
    }
  } else if (template?.guardrailDefaults) {
    floor = Math.round(basePrice * template.guardrailDefaults.absoluteFloorMultiplier);
    ceiling = Math.round(basePrice * template.guardrailDefaults.absoluteCeilingMultiplier);
  } else {
    floor = Math.round(basePrice * preset.floorMult);
    ceiling = Math.round(basePrice * preset.ceilingMult);
  }

  // DOW uplift
  const dowUplift = defaults?.weekendUpliftPct ?? preset.dowUpliftPct;
  const lastMinDisc = defaults?.lastMinuteDiscountPct ?? preset.lastMinuteDiscountPct;
  const farOutMark = defaults?.farOutMarkupPct ?? preset.farOutMarkupPct;

  // Update listing with all pricing configuration
  await Listing.findByIdAndUpdate(lid, {
    $set: {
      priceFloor: floor,
      priceCeiling: ceiling,
      floorReasoning: guardrailsSource === "ai"
        ? `Auto-set from Airbtics p25 ADR (lowest month) * 0.85`
        : sanity.result.pmsPriceTrusted
          ? `Auto-set from ${preset.floorMult}x base price (${listing.currencyCode} ${basePrice})`
          : `Auto-set from ${preset.floorMult}x validated base (${listing.currencyCode} ${basePrice}, source: ${sanity.result.source})`,
      ceilingReasoning: guardrailsSource === "ai"
        ? `Auto-set from Airbtics p75 ADR (highest month) * 1.3`
        : sanity.result.pmsPriceTrusted
          ? `Auto-set from ${preset.ceilingMult}x base price (${listing.currencyCode} ${basePrice})`
          : `Auto-set from ${preset.ceilingMult}x validated base (${listing.currencyCode} ${basePrice}, source: ${sanity.result.source})`,
      guardrailsSource,
      lastMinuteEnabled: true,
      lastMinuteDaysOut: preset.lastMinuteDaysOut,
      lastMinuteDiscountPct: lastMinDisc,
      lastMinuteMinStay: 1,
      farOutEnabled: true,
      farOutDaysOut: preset.farOutDaysOut,
      farOutMarkupPct: farOutMark,
      farOutMinStay: null,
      dowPricingEnabled: true,
      dowDays: weekendDays,
      dowPriceAdjPct: dowUplift,
      dowMinStay: null,
      gapPreventionEnabled: true,
      minFragmentThreshold: 2,
      gapFillEnabled: true,
      gapFillLengthMin: 1,
      gapFillLengthMax: 3,
      gapFillDiscountPct: preset.gapFillDiscountPct,
      gapFillOverrideCico: true,
      allowedCheckinDays: [1, 1, 1, 1, 1, 1, 1],
      allowedCheckoutDays: [1, 1, 1, 1, 1, 1, 1],
      lowestMinStayAllowed: 1,
      defaultMaxStay: 365,
    },
  });

  // Month-first market anchor handles seasonal ADR; only create Airbtics SEASON
  // rules when no portfolio pricing pack is on the org.
  let rulesCreated = 0;
  const { Organization } = await import("@/lib/db");
  const org = await Organization.findById(orgOid)
    .select("pricingPackVersion marketCode")
    .lean();
  const hasPricingPack =
    !!org?.pricingPackVersion || org?.marketCode === "UAE_DXB" || !org?.marketCode;

  if (!hasPricingPack) {
    rulesCreated = await generateSeasonalRules(
      lid,
      orgOid,
      basePrice,
      template,
      marketCtx,
      listing.currencyCode || "AED",
    );
  } else {
    await PricingRule.deleteMany({
      listingId: lid,
      ruleType: "SEASON",
      name: { $regex: /^\[Auto\]/ },
    });
  }

  return {
    listingId: lid.toString(),
    name: listing.name,
    status: "configured",
    guardrails: { floor, ceiling },
    rulesCreated,
    priceSanity: {
      source: sanity.result.source,
      trustedBasePrice: sanity.result.trustedBasePrice,
      pmsPriceTrusted: sanity.result.pmsPriceTrusted,
      insightCreated: sanity.insightCreated,
    },
  };
}

async function generateSeasonalRules(
  listingId: mongoose.Types.ObjectId,
  orgId: mongoose.Types.ObjectId,
  basePrice: number,
  template: any | null,
  marketCtx: Awaited<ReturnType<typeof getMarketContext>> | null,
  currencyCode: string,
): Promise<number> {
  // Remove existing auto-generated seasonal rules
  await PricingRule.deleteMany({
    listingId,
    ruleType: "SEASON",
    name: { $regex: /^\[Auto\]/ },
  });

  const rules: any[] = [];
  const currentYear = new Date().getFullYear();

  // Prefer Airbtics monthly metrics for seasonal rules
  if (marketCtx?.monthlyMetrics && marketCtx.monthlyMetrics.length > 0 && marketCtx.p50ADR) {
    const annualAdr = marketCtx.p50ADR;

    for (const metric of marketCtx.monthlyMetrics) {
      if (!metric.month || !metric.p50_adr) continue;
      const monthNum = parseInt(metric.month.split("-")[1], 10);
      if (isNaN(monthNum)) continue;

      const seasonMult = metric.p50_adr / annualAdr;
      const adjPct = Math.round((seasonMult - 1) * 100);

      // Only create rules for months with meaningful deviation (>5%)
      if (Math.abs(adjPct) < 5) continue;

      const label = adjPct > 15 ? "Peak" : adjPct > 0 ? "High" : adjPct < -15 ? "Low" : "Shoulder";

      // Generate the season rule for the current year and the next year so the
      // 365-day pricing window is always covered (start = 1st of month,
      // end = last day of that month).
      for (const yearOffset of [0, 1]) {
        const sy = currentYear + yearOffset;
        const sd = `${sy}-${String(monthNum).padStart(2, "0")}-01`;
        const eM = monthNum === 12 ? 1 : monthNum + 1;
        const eY = monthNum === 12 ? sy + 1 : sy;
        const ed = new Date(`${eY}-${String(eM).padStart(2, "0")}-01`);
        ed.setDate(ed.getDate() - 1);

        rules.push({
          orgId,
          listingId,
          ruleType: "SEASON",
          name: `[Auto] ${label} Season - ${getMonthName(monthNum)} ${sy}`,
          enabled: true,
          priority: 10,
          startDate: sd,
          endDate: ed.toISOString().split("T")[0],
          priceAdjPct: adjPct,
          isBlocked: false,
          closedToArrival: false,
          closedToDeparture: false,
          suspendLastMinute: false,
          suspendGapFill: false,
        });
      }
    }
  } else if (template?.seasonalPatterns) {
    // Fall back to market template seasonal patterns
    for (const pattern of template.seasonalPatterns) {
      if (Math.abs(pattern.ratePremiumPct) < 5) continue;

      const label = pattern.ratePremiumPct > 15
        ? "Peak"
        : pattern.ratePremiumPct > 0
          ? "High"
          : pattern.ratePremiumPct < -15
            ? "Low"
            : "Shoulder";

      for (const yearOffset of [0, 1]) {
        const y = currentYear + yearOffset;
        const monthNum = pattern.month;
        const sd = `${y}-${String(monthNum).padStart(2, "0")}-01`;
        const eM = monthNum === 12 ? 1 : monthNum + 1;
        const eY = monthNum === 12 ? y + 1 : y;
        const ed = new Date(`${eY}-${String(eM).padStart(2, "0")}-01`);
        ed.setDate(ed.getDate() - 1);

        rules.push({
          orgId,
          listingId,
          ruleType: "SEASON",
          name: `[Auto] ${label} Season - ${getMonthName(monthNum)} ${y}${pattern.notes ? ` (${pattern.notes})` : ""}`,
          enabled: true,
          priority: 10,
          startDate: sd,
          endDate: ed.toISOString().split("T")[0],
          priceAdjPct: pattern.ratePremiumPct,
          isBlocked: false,
          closedToArrival: false,
          closedToDeparture: false,
          suspendLastMinute: false,
          suspendGapFill: false,
        });
      }
    }
  }

  // LOS discount rules (standard: 7+ nights = 10%, 28+ nights = 20%)
  rules.push(
    {
      orgId,
      listingId,
      ruleType: "LOS_DISCOUNT",
      name: "[Auto] Weekly discount",
      enabled: true,
      priority: 5,
      minNights: 7,
      priceAdjPct: -10,
      isBlocked: false,
      closedToArrival: false,
      closedToDeparture: false,
      suspendLastMinute: false,
      suspendGapFill: false,
    },
    {
      orgId,
      listingId,
      ruleType: "LOS_DISCOUNT",
      name: "[Auto] Monthly discount",
      enabled: true,
      priority: 5,
      minNights: 28,
      priceAdjPct: -20,
      isBlocked: false,
      closedToArrival: false,
      closedToDeparture: false,
      suspendLastMinute: false,
      suspendGapFill: false,
    },
  );

  if (rules.length > 0) {
    await PricingRule.insertMany(rules);
  }

  return rules.length;
}

function resolveWeekendDays(weekendDef: string): number[] {
  // 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
  switch (weekendDef) {
    case "thu_fri":
      return [3, 4]; // some Middle East markets
    case "fri_sat":
      return [4, 5]; // common Western pattern
    case "sat_sun":
      return [5, 6];
    default:
      return [4, 5];
  }
}

function getMonthName(month: number): string {
  return [
    "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ][month] ?? "";
}

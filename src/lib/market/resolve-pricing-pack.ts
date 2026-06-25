import { connectDB, MarketTemplate } from "@/lib/db";
import { MARKET_TEMPLATES_SEED } from "@/lib/db/seed/market-templates";
import { UAE_PRICELABS_DEFAULTS } from "@/lib/pricing/uae-pricelabs-defaults";
import type { MarketPricingPack } from "@/lib/pricing/types";
import { applyPricingPackToOrg } from "@/lib/pricing/apply-defaults";
import { composePricingPackFromTemplate } from "./compose-pricing-pack";
import { bootstrapMarketPricingPack } from "./bootstrap-pricing-pack";

/**
 * Resolve the pricing pack for a market. UAE uses the hand-tuned PriceLabs export.
 * Non-UAE: cached bootstrap → live bootstrap → template compose fallback.
 */
export async function resolvePricingPackForMarket(
  marketCode: string,
  opts?: { bootstrap?: boolean }
): Promise<MarketPricingPack | null> {
  if (marketCode === "UAE_DXB") {
    return UAE_PRICELABS_DEFAULTS;
  }

  await connectDB();
  const template = await MarketTemplate.findOne({ marketCode, isActive: { $ne: false } }).lean();

  if (template?.pricingPack && template.pricingPackVersion) {
    return template.pricingPack as unknown as MarketPricingPack;
  }

  if (opts?.bootstrap !== false) {
    try {
      const { pack } = await bootstrapMarketPricingPack(marketCode);
      return pack;
    } catch (err) {
      console.warn(`[resolvePricingPack] bootstrap failed for ${marketCode}:`, (err as Error).message);
    }
  }

  if (template) {
    return composePricingPackFromTemplate(template);
  }

  const seed = MARKET_TEMPLATES_SEED.find((m) => m.marketCode === marketCode);
  if (seed) {
    return composePricingPackFromTemplate(seed);
  }

  return null;
}

/**
 * Apply market-appropriate pricing pack to org. Returns false when no pack exists (safe no-op).
 */
export async function resolveAndApplyPricingPack(
  orgId: string,
  marketCode: string
): Promise<{ applied: boolean; pack: MarketPricingPack | null }> {
  const pack = await resolvePricingPackForMarket(marketCode);
  if (!pack) {
    return { applied: false, pack: null };
  }

  await applyPricingPackToOrg(orgId, pack);
  return { applied: true, pack };
}
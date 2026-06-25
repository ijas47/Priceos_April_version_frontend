import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { syncMarketTemplatesFromSeed, AUTO_BOOTSTRAP_MARKETS } from "@/lib/db/seed/sync-markets";
import { bootstrapMarketPricingPack } from "@/lib/market/bootstrap-pricing-pack";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  return req.nextUrl.searchParams.get("secret") === secret;
}

/**
 * GET /api/cron/sync-market-templates
 *
 * Upserts market templates from seed, then bootstraps regional pricing packs
 * when missing or stale. Keeps production Mongo in sync with code deploys.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const force = req.nextUrl.searchParams.get("force") === "true";

  await connectDB();
  const sync = await syncMarketTemplatesFromSeed();

  const bootstrapResults: { marketCode: string; ok: boolean; cached?: boolean; error?: string }[] = [];

  for (const marketCode of AUTO_BOOTSTRAP_MARKETS) {
    try {
      const result = await bootstrapMarketPricingPack(marketCode, { force });
      bootstrapResults.push({
        marketCode,
        ok: true,
        cached: result.cached,
      });
    } catch (err) {
      bootstrapResults.push({
        marketCode,
        ok: false,
        error: (err as Error).message,
      });
    }
  }

  return NextResponse.json({
    success: true,
    sync,
    bootstrap: bootstrapResults,
  });
}
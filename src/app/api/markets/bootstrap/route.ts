import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";
import { bootstrapMarketPricingPack } from "@/lib/market/bootstrap-pricing-pack";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/markets/bootstrap
 * Body: { marketCode: "ESP_BCN", force?: boolean }
 *
 * Owner/admin: refresh cached regional pricing pack.
 * Onboarding auto-setup also calls bootstrap internally.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "owner" && session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const marketCode = typeof body.marketCode === "string" ? body.marketCode.trim() : "";
  if (!marketCode) {
    return NextResponse.json({ error: "marketCode is required" }, { status: 400 });
  }

  try {
    const result = await bootstrapMarketPricingPack(marketCode, {
      force: body.force === true,
    });

    return NextResponse.json({
      success: true,
      marketCode,
      cached: result.cached,
      sources: result.sources,
      version: result.pack.version,
      segments: result.pack.seasonalCalendars[0]?.segments?.length ?? 0,
    });
  } catch (err) {
    console.error("[markets/bootstrap]", err);
    return NextResponse.json(
      { error: (err as Error).message || "Bootstrap failed" },
      { status: 500 }
    );
  }
}
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";
import { runAutoSetup } from "@/lib/engine/auto-setup";

/**
 * POST /api/onboarding/auto-setup
 *
 * Auto-configures pricing for selected listings based on market data
 * and strategy choice. Called at the end of the onboarding wizard.
 *
 * Body:
 * {
 *   "listingIds": ["id1", "id2"],
 *   "marketCode": "UAE_DXB",
 *   "strategy": "conservative" | "balanced" | "aggressive",
 *   "pricingDefaults": { weekendUpliftPct, lastMinuteDiscountPct, farOutMarkupPct }
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { listingIds, marketCode, strategy, pricingDefaults } = body;

    if (!listingIds?.length) {
      return NextResponse.json({ error: "No listings selected" }, { status: 400 });
    }
    if (!marketCode) {
      return NextResponse.json({ error: "Market code required" }, { status: 400 });
    }
    if (!["conservative", "balanced", "aggressive"].includes(strategy)) {
      return NextResponse.json({ error: "Invalid strategy" }, { status: 400 });
    }

    const result = await runAutoSetup({
      orgId: session.orgId,
      listingIds,
      marketCode,
      strategy,
      pricingDefaults,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error("[auto-setup]", error);
    return NextResponse.json(
      { error: error.message || "Auto-setup failed" },
      { status: 500 },
    );
  }
}

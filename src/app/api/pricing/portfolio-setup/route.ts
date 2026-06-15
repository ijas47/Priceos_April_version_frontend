import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { getSession } from "@/lib/auth/server";
import { connectDB, Organization, Listing } from "@/lib/db";
import {
  runAutoSetup,
  portfolioGuardrailsFromStrategy,
  type Strategy,
} from "@/lib/engine/auto-setup";
import { applyPricingPackToOrg } from "@/lib/pricing/apply-defaults";

export const dynamic = "force-dynamic";
// Auto-setup runs the pricing engine per property; allow generous time.
export const maxDuration = 300;

const STRATEGIES: Strategy[] = ["conservative", "balanced", "aggressive"];

/**
 * GET /api/pricing/portfolio-setup
 *
 * Lightweight status for the Settings UI: how many properties exist, how many
 * already have guardrails configured, and the org's current saved strategy.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const orgId = new mongoose.Types.ObjectId(session.orgId);

    const [org, total, configured] = await Promise.all([
      Organization.findById(orgId)
        .select("pricingStrategy marketCode pricingPackVersion settings.guardrails")
        .lean(),
      Listing.countDocuments({ orgId }),
      Listing.countDocuments({ orgId, priceFloor: { $gt: 0 }, priceCeiling: { $gt: 0 } }),
    ]);

    return NextResponse.json({
      totalProperties: total,
      configuredProperties: configured,
      strategy: org?.pricingStrategy ?? null,
      marketCode: org?.marketCode ?? null,
      pricingPackVersion: org?.pricingPackVersion ?? null,
      guardrails: org?.settings?.guardrails ?? null,
    });
  } catch (error) {
    console.error("[portfolio-setup GET]", error);
    return NextResponse.json({ error: "Failed to load status" }, { status: 500 });
  }
}

/**
 * POST /api/pricing/portfolio-setup
 *
 * Applies smart pricing to ALL existing properties in the org in one shot —
 * for properties that were connected before the onboarding wizard ran, or to
 * re-baseline the whole portfolio before a demo.
 *
 * Two tiers, both seeded from the chosen strategy:
 *  - Portfolio level: org-wide guardrail defaults on Organization.settings.guardrails
 *  - Property level: per-listing floor/ceiling + seasonal + LOS rules, then the
 *    pricing engine runs so proposals populate.
 *
 * Writes only to MongoDB. Never pushes to Hostaway (pricing pushes stay blocked
 * by HOSTAWAY_READ_ONLY regardless).
 *
 * Body: { "strategy": "conservative" | "balanced" | "aggressive" }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const strategy: Strategy = STRATEGIES.includes(body?.strategy)
      ? body.strategy
      : "balanced";

    await connectDB();
    const orgId = new mongoose.Types.ObjectId(session.orgId);

    const org = await Organization.findById(orgId).lean();
    if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

    const listings = await Listing.find({ orgId }).select("_id").lean();
    if (listings.length === 0) {
      return NextResponse.json(
        { error: "No properties found. Connect Hostaway and sync listings first." },
        { status: 400 },
      );
    }

    // Portfolio level: guardrails + UAE PriceLabs profile pack.
    const portfolio = portfolioGuardrailsFromStrategy(strategy);
    await Organization.findByIdAndUpdate(orgId, {
      $set: {
        pricingStrategy: strategy,
        "settings.guardrails.maxSingleDayChangePct": portfolio.maxSingleDayChangePct,
        "settings.guardrails.autoApproveThreshold": portfolio.autoApproveThreshold,
        "settings.guardrails.absoluteFloorMultiplier": portfolio.absoluteFloorMultiplier,
        "settings.guardrails.absoluteCeilingMultiplier": portfolio.absoluteCeilingMultiplier,
      },
    });

    const packResult = await applyPricingPackToOrg(session.orgId);

    // Property level: floor/ceiling, seasonal + LOS rules, then run the engine.
    const result = await runAutoSetup({
      orgId: session.orgId,
      listingIds: listings.map((l) => l._id.toString()),
      marketCode: org.marketCode || "UAE_DXB",
      strategy,
    });

    return NextResponse.json({
      success: true,
      strategy,
      portfolioGuardrails: portfolio,
      pricingPackApplied: packResult,
      ...result,
    });
  } catch (error: any) {
    console.error("[portfolio-setup POST]", error);
    return NextResponse.json(
      { error: error?.message || "Portfolio setup failed" },
      { status: 500 },
    );
  }
}

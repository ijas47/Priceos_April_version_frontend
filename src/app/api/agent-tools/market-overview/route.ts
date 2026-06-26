import { NextRequest, NextResponse } from "next/server";
import { requireScopedSession } from "@/lib/agent-tools/utils";
import { getMarketContext, resolveMarketId } from "@/lib/airbtics/market-context";
import { assertListingOwned } from "@/lib/db/assert-listing-owned";
import { resolveBedroomsNumber } from "@/lib/pricing/bedrooms";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    try {
        const { orgId } = await requireScopedSession(req, "agent-tools/market-overview");

        const { searchParams } = new URL(req.url);
        let marketId = searchParams.get("marketId");
        const month = searchParams.get("month");
        const listingId = searchParams.get("listingId");
        let bedrooms = searchParams.get("bedrooms") ?? "2";

        if (listingId && !marketId) {
            const listing = await assertListingOwned(orgId, listingId);
            if (listing) {
                bedrooms = String(resolveBedroomsNumber(listing.bedroomsNumber, 1));
                const resolved = await resolveMarketId(
                    listing.city || "Dubai",
                    listing.countryCode || "AE"
                );
                if (resolved) marketId = resolved;
            }
        }

        if (!marketId) marketId = "2286";

        const ctx = await getMarketContext(marketId, bedrooms);

        let monthlyData = null;
        if (month && ctx.monthlyMetrics.length > 0) {
            monthlyData = ctx.monthlyMetrics.find((m) => m.month === month) ?? null;
        }

        return NextResponse.json({
            marketId,
            bedrooms,
            // Flat fields the CompSetViewer component expects
            adr: ctx.p50ADR,
            occupancy: ctx.occupancy != null ? Math.round(ctx.occupancy * 100) : null,
            revpar: ctx.p50ADR && ctx.occupancy ? Math.round(ctx.p50ADR * ctx.occupancy) : null,
            activeListings: ctx.activeListings,
            // Also keep nested summary for any other consumers
            summary: {
                adr: ctx.p50ADR,
                occupancy: ctx.occupancy != null ? Math.round(ctx.occupancy * 100) : null,
                revpar: ctx.p50ADR && ctx.occupancy ? Math.round(ctx.p50ADR * ctx.occupancy) : null,
                activeListings: ctx.activeListings,
            },
            monthlyMetrics: ctx.monthlyMetrics,
            futurePacing: ctx.futurePacing ?? [],
            fetchedAt: new Date().toISOString(),
            selectedMonth: monthlyData,
            source: ctx.errors.length === 0 ? "airbtics" : "partial",
            errors: ctx.errors,
        });
    } catch (error) {
        console.error("[market-overview]", error);
        return NextResponse.json({ error: "Failed to fetch market overview" }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";
import { getMarketContext, resolveMarketId } from "@/lib/airbtics/market-context";
import { connectDB, Listing } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { searchParams } = new URL(req.url);
        let marketId = searchParams.get("marketId");
        const month = searchParams.get("month");
        const listingId = searchParams.get("listingId");
        let bedrooms = searchParams.get("bedrooms") ?? "2";

        if (listingId && !marketId) {
            await connectDB();
            const listing = await Listing.findById(listingId).lean();
            if (listing) {
                bedrooms = String(listing.bedroomsNumber || 2);
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
            summary: {
                adr: ctx.p50ADR,
                occupancy: ctx.occupancy != null ? Math.round(ctx.occupancy * 100) : null,
                revpar: ctx.p50ADR && ctx.occupancy ? Math.round(ctx.p50ADR * ctx.occupancy) : null,
                activeListings: ctx.activeListings,
            },
            monthlyMetrics: ctx.monthlyMetrics,
            selectedMonth: monthlyData,
            source: ctx.errors.length === 0 ? "airbtics" : "partial",
            errors: ctx.errors,
        });
    } catch (error) {
        console.error("[market-overview]", error);
        return NextResponse.json({ error: "Failed to fetch market overview" }, { status: 500 });
    }
}

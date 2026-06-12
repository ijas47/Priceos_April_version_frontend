import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";
import { getMarketContext, resolveMarketId } from "@/lib/airbtics/market-context";
import { connectDB, Listing } from "@/lib/db";
import { format, addDays, parseISO, isWeekend } from "date-fns";

export const dynamic = "force-dynamic";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { searchParams } = new URL(req.url);
        let marketId = searchParams.get("marketId");
        const dateFrom = searchParams.get("dateFrom") ?? format(new Date(), "yyyy-MM-dd");
        const dateTo = searchParams.get("dateTo") ?? format(addDays(new Date(), 30), "yyyy-MM-dd");
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

        const pacing = ctx.futurePacing
            .filter((p) => p.date >= dateFrom && p.date <= dateTo)
            .map((p) => {
                const d = parseISO(p.date);
                const occ = typeof p.occupancy === "number" ? p.occupancy : null;
                const demandScore = occ !== null ? Math.round(occ * 100) : null;
                let demandTier: "low" | "medium" | "high" | "unknown" = "unknown";
                if (demandScore !== null) {
                    if (demandScore >= 75) demandTier = "high";
                    else if (demandScore >= 45) demandTier = "medium";
                    else demandTier = "low";
                }
                return {
                    date: p.date,
                    demandScore,
                    avgPrice: typeof p.adr === "number" ? p.adr : null,
                    pacing: occ,
                    demandTier,
                    dayOfWeek: DOW[d.getDay()],
                    isWeekend: isWeekend(d),
                };
            });

        return NextResponse.json({
            pacing,
            marketId,
            bedrooms,
            p50ADR: ctx.p50ADR,
            occupancy: ctx.occupancy,
            source: ctx.errors.length === 0 ? "airbtics" : "partial",
            errors: ctx.errors,
        });
    } catch (error) {
        console.error("[demand-pacing]", error);
        return NextResponse.json({ error: "Failed to fetch pacing data" }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB, Listing } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { getCompSet } from "@/lib/airbtics/market-context";
import { geocode, boundsAround } from "@/lib/geo/geocode";

export const dynamic = "force-dynamic";

/** Median of a numeric list (robust comp anchor — ignores outlier listings). */
function median(values: number[]): number | null {
    const nums = values.filter((v) => typeof v === "number" && v > 0).sort((a, b) => a - b);
    if (nums.length === 0) return null;
    const mid = Math.floor(nums.length / 2);
    return nums.length % 2 === 0 ? (nums[mid - 1] + nums[mid]) / 2 : nums[mid];
}

/**
 * GET /api/listings/[id]/comps
 *
 * Returns the nearby competitor listings (same bedroom count) for this
 * property from Airbtics, each flagged as selected/not. Geocodes the
 * property's address on first call and persists lat/lng so we only geocode
 * once. Read-only — never touches Hostaway.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const session = await getSession();
        if (!session?.orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { id } = await params;
        await connectDB();
        const orgId = new mongoose.Types.ObjectId(session.orgId);

        const listing = await Listing.findOne({ _id: new mongoose.Types.ObjectId(id), orgId });
        if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });

        // Geocode once and persist.
        let lat = listing.latitude;
        let lng = listing.longitude;
        if (lat === undefined || lng === undefined || lat === null || lng === null) {
            const point = await geocode(listing.address, listing.city, listing.countryCode);
            if (!point) {
                return NextResponse.json({
                    comps: [],
                    selected: listing.compListingIds ?? [],
                    error: "Could not geocode this property's address. Add a more specific address to fetch comps.",
                });
            }
            lat = point.lat;
            lng = point.lng;
            listing.latitude = lat;
            listing.longitude = lng;
            await listing.save();
        }

        const bounds = boundsAround({ lat, lng }, 4);
        const compSet = await getCompSet(bounds, listing.bedroomsNumber || 1);

        const selected = new Set(listing.compListingIds ?? []);
        const comps = compSet.listings
            .filter((c) => c.listing_id)
            .map((c) => ({
                listingId: String(c.listing_id),
                name: c.name ?? "Nearby listing",
                ltmAdr: c.ltm_adr ?? null,
                ltmOccupancy: c.ltm_occupancy ?? null,
                bedrooms: c.bedrooms ?? null,
                rating: c.rating ?? null,
                reviews: c.reviews ?? null,
                url: c.url ?? null,
                selected: selected.has(String(c.listing_id)),
            }))
            .sort((a, b) => (b.ltmAdr ?? 0) - (a.ltmAdr ?? 0));

        return NextResponse.json({
            comps,
            selected: [...selected],
            compAnchorAdr: listing.compAnchorAdr ?? null,
            currencyCode: listing.currencyCode,
            fetchedAt: compSet.fetchedAt,
            error: compSet.error,
        });
    } catch (error: any) {
        console.error("[listings/comps GET]", error);
        return NextResponse.json({ error: "Failed to load comps" }, { status: 500 });
    }
}

/**
 * POST /api/listings/[id]/comps  { compListingIds, compAdrs? }
 *
 * Saves the selected comp listing IDs and recomputes the comp anchor ADR
 * (median of the selected comps' trailing ADR). The engine reads compAnchorAdr
 * to anchor this listing's base price.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const session = await getSession();
        if (!session?.orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { id } = await params;
        const body = await req.json().catch(() => ({}));
        const compListingIds: string[] = Array.isArray(body.compListingIds)
            ? body.compListingIds.map(String)
            : [];

        await connectDB();
        const orgId = new mongoose.Types.ObjectId(session.orgId);
        const listing = await Listing.findOne({ _id: new mongoose.Types.ObjectId(id), orgId });
        if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });

        // Recompute the comp anchor from the selected comps. The client passes
        // the ADRs it already has so we avoid a second Airbtics round-trip; if
        // absent we fall back to a fresh comp-set fetch.
        let adrs: number[] = [];
        if (Array.isArray(body.compAdrs) && body.compAdrs.length > 0) {
            adrs = body.compAdrs.map(Number).filter((n: number) => n > 0);
        } else if (compListingIds.length > 0 && listing.latitude != null && listing.longitude != null) {
            const bounds = boundsAround({ lat: listing.latitude, lng: listing.longitude }, 4);
            const compSet = await getCompSet(bounds, listing.bedroomsNumber || 1);
            const wanted = new Set(compListingIds);
            adrs = compSet.listings
                .filter((c) => c.listing_id && wanted.has(String(c.listing_id)) && c.ltm_adr)
                .map((c) => c.ltm_adr as number);
        }

        const anchor = median(adrs);
        listing.compListingIds = compListingIds;
        listing.compAnchorAdr = anchor ?? undefined;
        listing.compsFetchedAt = new Date();
        await listing.save();

        return NextResponse.json({
            success: true,
            selectedCount: compListingIds.length,
            compAnchorAdr: anchor,
            message: anchor
                ? `Saved ${compListingIds.length} comps. Anchor ADR ${anchor.toFixed(0)} — re-run pricing to apply.`
                : `Saved ${compListingIds.length} comps. Re-run pricing to apply.`,
        });
    } catch (error: any) {
        console.error("[listings/comps POST]", error);
        return NextResponse.json({ error: "Failed to save comps" }, { status: 500 });
    }
}

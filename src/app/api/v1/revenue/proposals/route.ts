import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB, InventoryMaster, Listing } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/api/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/revenue/proposals
 *
 * Returns pricing proposals from InventoryMaster — the same collection
 * the pricing engine writes to. Supports filtering by status and listingId.
 *
 * Query params:
 *   status   = "pending" | "approved" | "rejected" | "pushed" | "all" (default "all")
 *   listingId = optional ObjectId filter
 */
export async function GET(request: Request) {
    const ip = getClientIp(request);
    const rateCheck = checkRateLimit(`revenue-proposals-get:${ip}`, RATE_LIMITS.standard);
    if (!rateCheck.allowed) {
        return NextResponse.json(
            { error: `Rate limited — try again in ${Math.ceil(rateCheck.resetMs / 1000)}s` },
            { status: 429 },
        );
    }

    try {
        const session = await getSession();
        if (!session?.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await connectDB();
        const orgId = new mongoose.Types.ObjectId(session.orgId);

        const { searchParams } = new URL(request.url);
        const statusParam = searchParams.get("status") || "all";
        const listingIdParam = searchParams.get("listingId");

        const filter: Record<string, unknown> = { orgId };

        if (statusParam !== "all") {
            filter.proposalStatus = statusParam;
        } else {
            filter.proposalStatus = { $in: ["pending", "approved", "rejected", "pushed"] };
        }

        if (listingIdParam) {
            filter.listingId = new mongoose.Types.ObjectId(listingIdParam);
        }

        // Only show proposals where the price actually changes, or status
        // adjustments (min-stay, closed-to-arrival, blocked). Skip booked
        // days and zero-change noise so the list is actionable.
        filter.status = { $ne: "booked" };
        filter.changePct = { $ne: 0 };

        // Fetch proposals — most recent dates first, capped at 500
        const rows = await InventoryMaster.find(filter)
            .sort({ date: 1 })
            .limit(500)
            .lean();

        // Build a listing-name lookup for the UI
        const listingIds = [...new Set(rows.map((r) => r.listingId.toString()))];
        const listings = await Listing.find({
            _id: { $in: listingIds.map((id) => new mongoose.Types.ObjectId(id)) },
        })
            .select("_id name currencyCode")
            .lean();
        const nameMap = new Map(listings.map((l) => [l._id.toString(), l]));

        const proposals = rows.map((r) => {
            const listing = nameMap.get(r.listingId.toString());
            const currentPrice = r.currentPrice ?? r.basePrice ?? 0;
            const proposedPrice = r.proposedPrice ?? currentPrice;
            return {
                id: r._id.toString(),
                listingId: r.listingId.toString(),
                date: r.date,
                currentPrice: String(currentPrice),
                proposedPrice: String(proposedPrice),
                // Revenue-optimization shadow values (for the rulebook-vs-optimized comparison)
                elasticityPrice: r.elasticityPrice != null ? String(r.elasticityPrice) : null,
                elasticityWeight: r.elasticityWeight ?? null,
                pBook: r.pBook ?? null,
                changePct: r.changePct ?? 0,
                reasoning: r.reasoning ?? "",
                minStay: r.minStay ?? null,
                maxStay: r.maxStay ?? null,
                closedToArrival: r.closedToArrival ?? false,
                closedToDeparture: r.closedToDeparture ?? false,
                proposalStatus: r.proposalStatus ?? "pending",
                listingName: listing?.name ?? "Unknown",
                currencyCode: (listing as any)?.currencyCode ?? "AED",
            };
        });

        return NextResponse.json({ proposals, count: proposals.length });
    } catch (error: any) {
        console.error("[v1/revenue/proposals GET]", error);
        return NextResponse.json({ error: "Failed to fetch proposals" }, { status: 500 });
    }
}

/**
 * POST /api/v1/revenue/proposals — bulk approve / reject proposals.
 */
export async function POST(request: Request) {
    const ip = getClientIp(request);
    const rateCheck = checkRateLimit(`revenue-proposals-bulk:${ip}`, RATE_LIMITS.standard);
    if (!rateCheck.allowed) {
        return NextResponse.json(
            { error: `Rate limited — try again in ${Math.ceil(rateCheck.resetMs / 1000)}s` },
            { status: 429 },
        );
    }

    try {
        const session = await getSession();
        if (!session?.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await connectDB();
        const orgId = new mongoose.Types.ObjectId(session.orgId);

        const body = await request.json();
        const { ids, action } = body;

        if (!Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ error: "ids array is required" }, { status: 400 });
        }
        if (!["approve", "reject"].includes(action)) {
            return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
        }

        const newStatus = action === "approve" ? "approved" : "rejected";

        const result = await InventoryMaster.updateMany(
            {
                _id: { $in: ids.map((id: string) => new mongoose.Types.ObjectId(id)) },
                orgId,
            },
            { $set: { proposalStatus: newStatus } },
        );

        return NextResponse.json({
            processed: result.modifiedCount,
            action,
            message: `${result.modifiedCount} proposals ${newStatus}.`,
        });
    } catch (error: any) {
        console.error("[v1/revenue/proposals POST]", error);
        return NextResponse.json({ error: "Failed to process proposals" }, { status: 500 });
    }
}

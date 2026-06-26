import { NextRequest, NextResponse } from "next/server";
import { connectDB, ChatMessage, InventoryMaster, MarketEvent } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { assertListingOwned, ListingAccessError } from "@/lib/db/assert-listing-owned";
import { addDays, format } from "date-fns";
import mongoose from "mongoose";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await req.json();
        const { message, startDate: startStr, endDate: endStr } = body;

        const session = await getSession();
        if (!session?.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await connectDB();
        const orgId = new mongoose.Types.ObjectId(session.orgId);

        let listingObjectId: mongoose.Types.ObjectId;
        try {
            listingObjectId = new mongoose.Types.ObjectId(id);
        } catch {
            return NextResponse.json({ error: "Invalid property ID" }, { status: 400 });
        }

        const startDate = startStr ? new Date(startStr) : new Date();
        const endDate = endStr ? new Date(endStr) : addDays(startDate, 30);
        const startDateStr = format(startDate, "yyyy-MM-dd");
        const endDateStr = format(endDate, "yyyy-MM-dd");

        const listing = await assertListingOwned(session.orgId, listingObjectId);

        const calendar = await InventoryMaster.find({
            orgId,
            listingId: listingObjectId,
            date: { $gte: startDateStr, $lte: endDateStr },
        }).lean();

        const events = await MarketEvent.find({
            orgId,
            endDate: { $gte: startDateStr },
            startDate: { $lte: endDateStr },
            isActive: true,
        }).lean();

        // 4. Build context for backend
        const contextData = {
            property: {
                id: listing._id.toString(),
                name: listing.name,
                area: listing.area,
                city: listing.city,
                base_price: listing.price,
                price_floor: listing.priceFloor,
                price_ceiling: listing.priceCeiling,
                amenities: listing.amenities,
            },
            inventory: calendar.map((c) => ({
                date: c.date,
                status: c.status,
                price: c.currentPrice,
                min_stay: c.minStay,
            })),
            market_events: events.map((e) => ({
                title: e.name,
                dates: `${e.startDate} to ${e.endDate}`,
                impact: e.impactLevel,
                description: e.description,
            })),
        };

        // 5. Save user message
        await ChatMessage.create({
            orgId,
            sessionId: `property-${id}`,
            role: "user",
            content: message,
            context: { type: "property", propertyId: listingObjectId },
            metadata: { listingId: id },
        });

        // 6. Proxy to Python backend
        const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";
        const agentResponse = await fetch(`${backendUrl}/api/agent/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message,
                user_id: session?.userId || "user-1",
                session_id: `property-${id}`,
                cache: contextData,
            }),
        });

        if (!agentResponse.ok) {
            const errText = await agentResponse.text();
            throw new Error(`Backend Error: ${errText}`);
        }

        const result = await agentResponse.json();
        const responseMessage = result.response?.response || "I couldn't generate a report right now.";

        // 7. Save assistant message
        await ChatMessage.create({
            orgId,
            sessionId: `property-${id}`,
            role: "assistant",
            content: responseMessage,
            context: { type: "property", propertyId: listingObjectId },
            metadata: { listingId: id, backend_result: result.response },
        });

        return NextResponse.json({ message: responseMessage, proposals: [] });
    } catch (error) {
        if (error instanceof ListingAccessError) {
            return NextResponse.json({ error: error.message }, { status: 404 });
        }
        console.error("Error in property chat:", error);
        return NextResponse.json({ error: "Failed to process chat message" }, { status: 500 });
    }
}

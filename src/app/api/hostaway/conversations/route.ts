import { NextResponse } from "next/server";
import { connectDB, HostawayConversation, Listing } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import mongoose from "mongoose";

/**
 * GET /api/hostaway/conversations
 *
 * Fetches conversations from Hostaway API, caches to MongoDB.
 *
 * Query params: listingId, from, to
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const listingId = searchParams.get("listingId");
    const dateFrom = searchParams.get("from");
    const dateTo = searchParams.get("to");

    console.log(`🚀 [Hostaway Sync] GET /api/hostaway/conversations`);
    console.log(`   ├─ listingId: ${listingId}`);
    console.log(`   ├─ dateFrom: ${dateFrom}`);
    console.log(`   └─ dateTo: ${dateTo}`);

    if (!listingId || !dateFrom || !dateTo) {
        return NextResponse.json(
            { error: "listingId, from, and to query params are required" },
            { status: 400 }
        );
    }

    try {
        await connectDB();

        const session = await getSession();
        const orgId = session?.orgId
            ? new mongoose.Types.ObjectId(session.orgId)
            : new mongoose.Types.ObjectId();

        let listingObjectId: mongoose.Types.ObjectId;
        try {
            listingObjectId = new mongoose.Types.ObjectId(listingId);
        } catch {
            return NextResponse.json({ error: "Invalid listingId" }, { status: 400 });
        }

        const token = process.env.Hostaway_Authorization_token;
        if (!token) {
            throw new Error("Hostaway_Authorization_token is not set in .env");
        }

        const listing = await Listing.findById(listingObjectId).select("hostawayId").lean();
        if (!listing) {
            return NextResponse.json({ error: "Listing not found" }, { status: 404 });
        }

        const hostawayListingId = listing.hostawayId;
        console.log(`📥 [Hostaway Sync] Fetching ALL conversations with includeResources=1...`);

        const convRes = await fetch(
            `https://api.hostaway.com/v1/conversations?limit=100&offset=0&includeResources=1`,
            {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                cache: "no-store",
            }
        );

        if (!convRes.ok) {
            throw new Error(`Hostaway API returned ${convRes.status}: ${convRes.statusText}`);
        }

        const convJson = await convRes.json();
        const rawConversations = convJson.result || [];

        console.log(`📋 [Hostaway Sync] Total conversations from Hostaway: ${rawConversations.length}`);

        const filteredByListing = hostawayListingId
            ? rawConversations.filter((conv: any) => {
                  const reservationListingId = conv.Reservation?.listingMapId?.toString();
                  const convListingMapId = conv.listingMapId?.toString();
                  return (
                      reservationListingId === hostawayListingId ||
                      convListingMapId === hostawayListingId
                  );
              })
            : rawConversations;

        const fromDate = new Date(dateFrom);
        const toDate = new Date(dateTo);

        const filteredByDate = filteredByListing.filter((conv: any) => {
            const arrivalDate = conv.Reservation?.arrivalDate;
            const departureDate = conv.Reservation?.departureDate;
            if (!arrivalDate && !departureDate) return true;
            const arrival = arrivalDate ? new Date(arrivalDate) : fromDate;
            const departure = departureDate ? new Date(departureDate) : toDate;
            return arrival <= toDate && departure >= fromDate;
        });

        console.log(`📅 [Hostaway Sync] After date filter: ${filteredByDate.length} conversations`);

        const fullConversations = [];

        for (const conv of filteredByDate) {
            const convId = conv.id.toString();
            const guestName =
                conv.recipientName ||
                conv.Reservation?.guestName ||
                conv.Reservation?.guestFirstName ||
                "Guest";

            try {
                const msgRes = await fetch(
                    `https://api.hostaway.com/v1/conversations/${convId}/messages?limit=50`,
                    {
                        method: "GET",
                        headers: {
                            Authorization: `Bearer ${token}`,
                            "Content-Type": "application/json",
                        },
                        cache: "no-store",
                    }
                );

                let messages: { sender: string; text: string; timestamp: string }[] = [];

                if (msgRes.ok) {
                    const msgJson = await msgRes.json();
                    const rawMsgs = msgJson.result || [];
                    messages = rawMsgs
                        .filter((m: any) => m.body && m.body.trim())
                        .map((m: any) => ({
                            sender: m.isIncoming ? "guest" : "admin",
                            text: m.body || "",
                            timestamp: m.insertedOn || m.updatedOn || "",
                        }));
                }

                fullConversations.push({
                    hostawayConversationId: convId,
                    guestName,
                    guestEmail: conv.guestEmail || conv.recipientEmail || null,
                    reservationId: conv.reservationId?.toString() || null,
                    messages,
                });
            } catch {
                console.warn(`   ⚠️  Failed to fetch messages for conv ${convId}, skipping...`);
                fullConversations.push({
                    hostawayConversationId: convId,
                    guestName,
                    guestEmail: conv.guestEmail || conv.recipientEmail || null,
                    reservationId: conv.reservationId?.toString() || null,
                    messages: [],
                });
            }
        }

        console.log(`💾 [Hostaway Sync] Saving ${fullConversations.length} conversations to MongoDB...`);

        // Clear old cached conversations for this listing+daterange
        await HostawayConversation.deleteMany({
            listingId: listingObjectId,
            dateFrom,
            dateTo,
        });

        for (const conv of fullConversations) {
            await HostawayConversation.create({
                orgId,
                listingId: listingObjectId,
                hostawayConversationId: conv.hostawayConversationId,
                guestName: conv.guestName,
                guestEmail: conv.guestEmail,
                reservationId: conv.reservationId,
                messages: conv.messages,
                dateFrom,
                dateTo,
                needsReply:
                    conv.messages.length > 0 &&
                    conv.messages[conv.messages.length - 1].sender === "guest",
                syncedAt: new Date(),
            });
        }

        console.log(`✅ [Hostaway Sync] Synced ${fullConversations.length} conversations`);

        const uiConversations = fullConversations.map((conv) => ({
            id: conv.hostawayConversationId,
            guestName: conv.guestName,
            lastMessage:
                conv.messages.length > 0
                    ? conv.messages[conv.messages.length - 1].text.substring(0, 80) +
                      (conv.messages[conv.messages.length - 1].text.length > 80 ? "..." : "")
                    : "No messages",
            status:
                conv.messages.length > 0 &&
                conv.messages[conv.messages.length - 1].sender === "guest"
                    ? "needs_reply"
                    : "resolved",
            messages: conv.messages.map((m, idx) => ({
                id: `${conv.hostawayConversationId}_${idx}`,
                sender: m.sender as "guest" | "admin",
                text: m.text,
                time: m.timestamp
                    ? new Date(m.timestamp).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                      })
                    : "",
            })),
        }));

        return NextResponse.json({
            success: true,
            message: `Synced ${uiConversations.length} conversations for this property`,
            conversations: uiConversations,
            cached: false,
        });
    } catch (error) {
        console.error("❌ [Hostaway Sync] Error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to sync" },
            { status: 500 }
        );
    }
}

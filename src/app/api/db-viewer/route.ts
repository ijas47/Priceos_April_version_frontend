import { NextResponse } from "next/server";
import {
    connectDB,
    Listing,
    InventoryMaster,
    Reservation,
    MarketEvent,
    ChatMessage,
    GuestSummary,
    HostawayConversation,
    BenchmarkData,
} from "@/lib/db";
import { getSession } from "@/lib/auth/server";

export async function GET() {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        // Tenant isolation: every query below is scoped to the caller's org.
        const scope = { orgId: session.orgId };

        await connectDB();

        const [
            listingsCount,
            inventoryCount,
            reservationsCount,
            marketEventsCount,
            chatMessagesCount,
            guestSummariesCount,
            hwConversationsCount,
            benchmarkCount,
        ] = await Promise.all([
            Listing.countDocuments(scope),
            InventoryMaster.countDocuments(scope),
            Reservation.countDocuments(scope),
            MarketEvent.countDocuments(scope),
            ChatMessage.countDocuments(scope),
            GuestSummary.countDocuments(scope),
            HostawayConversation.countDocuments(scope),
            BenchmarkData.countDocuments(scope),
        ]);

        const [
            listingsData,
            inventoryData,
            reservationsData,
            marketEventsData,
            chatMessagesData,
            guestSummariesData,
            hwConversationsData,
            benchmarkDataRows,
        ] = await Promise.all([
            Listing.find(scope).lean(),
            InventoryMaster.find(scope).sort({ date: -1 }).lean(),
            Reservation.find(scope).sort({ checkIn: -1 }).lean(),
            MarketEvent.find(scope).sort({ startDate: -1 }).lean(),
            ChatMessage.find(scope).sort({ createdAt: -1 }).lean(),
            GuestSummary.find(scope).sort({ createdAt: -1 }).lean(),
            HostawayConversation.find(scope).sort({ syncedAt: -1 }).lean(),
            BenchmarkData.find(scope).sort({ createdAt: -1 }).lean(),
        ]);

        // Date ranges from inventory (org-scoped)
        const inventoryDates = await InventoryMaster.aggregate([
            { $match: scope },
            { $group: { _id: null, min: { $min: "$date" }, max: { $max: "$date" } } },
        ]);
        const reservationDates = await Reservation.aggregate([
            { $match: scope },
            { $group: { _id: null, min: { $min: "$checkIn" }, max: { $max: "$checkIn" } } },
        ]);

        return NextResponse.json({
            summary: {
                listings: listingsCount,
                inventory_master: inventoryCount,
                reservations: reservationsCount,
                market_events: marketEventsCount,
                chat_messages: chatMessagesCount,
                guest_summaries: guestSummariesCount,
                hostaway_conversations: hwConversationsCount,
                benchmark_data: benchmarkCount,
            },
            date_ranges: {
                calendar: inventoryDates[0] || { min: null, max: null },
                reservations: reservationDates[0] || { min: null, max: null },
            },
            data: {
                listings: listingsData,
                inventory_master: inventoryData,
                reservations: reservationsData,
                market_events: marketEventsData,
                chat_messages: chatMessagesData,
                guest_summaries: guestSummariesData,
                hostaway_conversations: hwConversationsData,
                benchmark_data: benchmarkDataRows,
            },
        });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Database query failed" },
            { status: 500 }
        );
    }
}

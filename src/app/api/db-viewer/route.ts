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

export async function GET() {
    try {
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
            Listing.countDocuments(),
            InventoryMaster.countDocuments(),
            Reservation.countDocuments(),
            MarketEvent.countDocuments(),
            ChatMessage.countDocuments(),
            GuestSummary.countDocuments(),
            HostawayConversation.countDocuments(),
            BenchmarkData.countDocuments(),
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
            Listing.find().lean(),
            InventoryMaster.find().sort({ date: -1 }).lean(),
            Reservation.find().sort({ checkIn: -1 }).lean(),
            MarketEvent.find().sort({ startDate: -1 }).lean(),
            ChatMessage.find().sort({ createdAt: -1 }).lean(),
            GuestSummary.find().sort({ createdAt: -1 }).lean(),
            HostawayConversation.find().sort({ syncedAt: -1 }).lean(),
            BenchmarkData.find().sort({ createdAt: -1 }).lean(),
        ]);

        // Date ranges from inventory
        const inventoryDates = await InventoryMaster.aggregate([
            { $group: { _id: null, min: { $min: "$date" }, max: { $max: "$date" } } },
        ]);
        const reservationDates = await Reservation.aggregate([
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

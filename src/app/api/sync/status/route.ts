import { connectDB, Listing, Reservation, InventoryMaster } from "@/lib/db";
import mongoose from "mongoose";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const context = searchParams.get("context") || "portfolio";
    const propertyId = searchParams.get("propertyId");

    try {
        // Global sync status (in-memory)
        const globalSyncStatus = (globalThis as any).syncStatus || { status: "idle", message: "" };

        if (
            (globalSyncStatus.status === "complete" || globalSyncStatus.status === "error") &&
            globalSyncStatus.startedAt
        ) {
            if (Date.now() - globalSyncStatus.startedAt > 30000) {
                (globalThis as any).syncStatus = { status: "idle", message: "" };
            }
        }

        await connectDB();

        let listingsCount = 0;
        let reservationsCount = 0;
        let calendarCount = 0;
        let reservationsLastSynced: Date | null = null;

        if (context === "portfolio") {
            [listingsCount, reservationsCount, calendarCount] = await Promise.all([
                Listing.countDocuments(),
                Reservation.countDocuments(),
                InventoryMaster.countDocuments(),
            ]);
            const lastRes = await Reservation.findOne().sort({ createdAt: -1 }).select("createdAt").lean();
            reservationsLastSynced = lastRes?.createdAt || null;
        } else if (propertyId) {
            let lid: mongoose.Types.ObjectId;
            try {
                lid = new mongoose.Types.ObjectId(propertyId);
            } catch {
                return NextResponse.json({ error: "Invalid propertyId" }, { status: 400 });
            }

            [listingsCount, reservationsCount, calendarCount] = await Promise.all([
                Listing.countDocuments({ _id: lid }),
                Reservation.countDocuments({ listingId: lid }),
                InventoryMaster.countDocuments({ listingId: lid }),
            ]);
            const lastRes = await Reservation.findOne({ listingId: lid })
                .sort({ createdAt: -1 })
                .select("createdAt")
                .lean();
            reservationsLastSynced = lastRes?.createdAt || null;
        }

        return NextResponse.json({
            ...globalSyncStatus,
            listings: { count: listingsCount, lastSyncedAt: reservationsLastSynced?.toISOString() || null },
            reservations: { count: reservationsCount, lastSyncedAt: reservationsLastSynced?.toISOString() || null },
            inventory_master: { daysCount: calendarCount, lastSyncedAt: reservationsLastSynced?.toISOString() || null },
        });
    } catch (error: any) {
        console.error("Status check failed:", error);
        return NextResponse.json({ status: "error", message: error.message || "Failed to fetch status" }, { status: 500 });
    }
}

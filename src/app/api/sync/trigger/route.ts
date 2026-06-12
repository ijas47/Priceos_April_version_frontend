import { NextResponse } from "next/server";
import { createPMSClient } from "@/lib/pms";
import { getSession } from "@/lib/auth/server";
import { connectDB, Listing, Reservation } from "@/lib/db";
import { syncListingsToDb, syncReservationsToDb, syncCalendarToDb, syncConversationsToDb } from "@/lib/sync-server-utils";
import mongoose from "mongoose";

// Global sync status tracker
declare global {
    var syncStatus: { status: 'idle' | 'syncing' | 'complete' | 'error'; message: string; startedAt?: number };
}

globalThis.syncStatus = globalThis.syncStatus || { status: 'idle', message: '' };

// Sync of 30+ properties takes minutes — allow the function to run long.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function performBackgroundSync(orgId: string) {
    globalThis.syncStatus = { status: 'syncing', message: 'Starting sync...', startedAt: Date.now() };
    try {
        const client = createPMSClient();

        // Guard: never import mock/db placeholder data as if it were real.
        if (client.getMode() !== "live") {
            throw new Error(
                "Hostaway live mode is not configured. Set HOSTAWAY_MODE=live, " +
                "HOSTAWAY_API_KEY and HOSTAWAY_API_BASE_URL in Vercel, then redeploy."
            );
        }
        console.log("------------------------------------------");
        console.log("🚀 Starting Hostaway Synchronization (BACKGROUND)...");
        console.log("------------------------------------------");

        await connectDB();

        // 1. Fetch & Sync Listings
        globalThis.syncStatus.message = 'Syncing listings...';
        const hListings = await client.listListings();
        const existingCount = await Listing.countDocuments();

        console.log(`📥 Step 1: Fetched ${hListings.length} total listings from Hostaway.`);

        await syncListingsToDb(hListings.map(l => ({ ...l, id: Number(l.id) })), orgId);

        // Map Hostaway IDs -> Internal MongoDB ObjectIds
        const orgOid = new mongoose.Types.ObjectId(orgId);
        const dbListings = await Listing.find({ orgId: orgOid }, { hostawayId: 1 }).lean();
        const hostawayToInternalIdMap = new Map<number, mongoose.Types.ObjectId>(
            dbListings
                .filter(l => l.hostawayId)
                .map(l => [Number(l.hostawayId), l._id as mongoose.Types.ObjectId])
        );

        const newListingCount = (await Listing.countDocuments()) - existingCount;
        console.log(`✅ Step 1 Complete: ${dbListings.length} listings in DB (${newListingCount} new).`);

        // 2. Fetch & Sync Calendars (for the next 90 days)
        globalThis.syncStatus.message = 'Syncing calendar data...';
        console.log("📥 Step 2: Fetching Calendar data (90-day window)...");
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 90);

        let calendarsSynced = 0;
        let calendarErrors = 0;

        for (let i = 0; i < hListings.length; i++) {
            const hl = hListings[i];
            const internalId = hostawayToInternalIdMap.get(Number(hl.id));
            if (internalId) {
                try {
                    globalThis.syncStatus.message = `Syncing calendar ${i + 1}/${hListings.length}...`;
                    console.log(`   [${i + 1}/${hListings.length}] Syncing calendar for ${hl.name} (${hl.id})...`);
                    await syncCalendarToDb(client, [internalId], startDate, endDate, Number(hl.id));
                    calendarsSynced++;
                } catch (calErr: any) {
                    console.error(`   ❌ Failed calendar for ${hl.id}:`, calErr.message);
                    calendarErrors++;
                }
            }
        }

        console.log(`✅ Step 2 Complete: Synced ${calendarsSynced} property calendars (${calendarErrors} failed).`);

        // 3. Fetch & Sync Reservations
        globalThis.syncStatus.message = 'Syncing reservations...';
        console.log("📥 Step 3: Fetching Reservations (Limit: 1000)...");
        const hReservations = await client.getReservations({ limit: 1000 } as any);
        console.log(`📥 Fetched ${hReservations.length} reservations from Hostaway.`);

        const existingResCount = await Reservation.countDocuments();

        const mappedReservations = hReservations
            .map(r => {
                const internalListingId = hostawayToInternalIdMap.get(Number(r.listingMapId));
                if (!internalListingId) return null;
                return { ...r, listingMapId: internalListingId };
            })
            .filter((r): r is NonNullable<typeof r> => r !== null);

        if (mappedReservations.length > 0) {
            await syncReservationsToDb(mappedReservations as any, new Date());
        }

        const newReservationCount = (await Reservation.countDocuments()) - existingResCount;
        console.log(`✅ Step 3 Complete: Reservations synced (${newReservationCount} new).`);

        // 4. Fetch & Sync Conversations
        globalThis.syncStatus.message = 'Syncing conversations...';
        console.log("📥 Step 4: Fetching Conversations...");
        const convStats = await syncConversationsToDb(hostawayToInternalIdMap);
        console.log(`✅ Step 4 Complete: Synced ${convStats.synced} conversations (${convStats.errors} errors).`);

        console.log("------------------------------------------");
        console.log("🎉 Hostaway Sync Finished Successfully.");
        console.log("------------------------------------------");

        globalThis.syncStatus = { status: 'complete', message: 'Sync completed successfully!' };

    } catch (err: any) {
        console.error("❌ Critical Sync Error in Background Job:", err);
        globalThis.syncStatus = { status: 'error', message: err.message || 'Unknown sync error' };
    }
}

export async function POST() {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Prevent duplicate syncs
    if (globalThis.syncStatus?.status === 'syncing') {
        return NextResponse.json({
            success: false,
            status: "already_syncing",
            message: "A sync is already in progress."
        }, { status: 409 });
    }

    // Awaited: fire-and-forget work is killed when the serverless
    // function returns, so the request stays open until sync completes.
    await performBackgroundSync(session.orgId);

    const final = globalThis.syncStatus;
    return NextResponse.json({
        success: final.status === 'complete',
        status: final.status,
        message: final.message,
    }, { status: final.status === 'complete' ? 200 : 500 });
}

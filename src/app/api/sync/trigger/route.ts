import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";
import { connectDB, Listing, Reservation } from "@/lib/db";
import {
  syncListingsToDb,
  syncReservationsToDb,
  syncCalendarToDb,
  syncConversationsToDb,
} from "@/lib/sync-server-utils";
import { syncOrgMarketEvents } from "@/lib/research/sync-org-events";
import { resolveHostawayAccessToken } from "@/lib/hostaway/resolve-token";
import { LivePMSClient } from "@/lib/pms/live-client";
import mongoose from "mongoose";

declare global {
  var syncStatus: {
    status: "idle" | "syncing" | "complete" | "error";
    message: string;
    startedAt?: number;
    orgId?: string;
  };
}

globalThis.syncStatus = globalThis.syncStatus || { status: "idle", message: "" };

export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function performBackgroundSync(orgId: string) {
  globalThis.syncStatus = {
    status: "syncing",
    message: "Starting sync...",
    startedAt: Date.now(),
    orgId,
  };

  try {
    await connectDB();
    const accessToken = await resolveHostawayAccessToken(orgId);
    const client = new LivePMSClient(accessToken);

    console.log("------------------------------------------");
    console.log(`🚀 Hostaway sync for org ${orgId} (per-org credentials)`);
    console.log("------------------------------------------");

    globalThis.syncStatus.message = "Syncing listings...";
    const hListings = await client.listListings();
    const orgOid = new mongoose.Types.ObjectId(orgId);
    const existingCount = await Listing.countDocuments({ orgId: orgOid });

    console.log(`📥 Step 1: Fetched ${hListings.length} listings from Hostaway.`);

    await syncListingsToDb(
      hListings.map((l) => ({ ...l, id: Number(l.id) })),
      orgId
    );

    const dbListings = await Listing.find({ orgId: orgOid }, { hostawayId: 1 }).lean();
    const hostawayToInternalIdMap = new Map<number, mongoose.Types.ObjectId>(
      dbListings
        .filter((l) => l.hostawayId)
        .map((l) => [Number(l.hostawayId), l._id as mongoose.Types.ObjectId])
    );

    const newListingCount =
      (await Listing.countDocuments({ orgId: orgOid })) - existingCount;
    console.log(
      `✅ Step 1: ${dbListings.length} listings for org (${newListingCount} new).`
    );

    globalThis.syncStatus.message = "Syncing calendar data...";
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 90);

    let calendarsSynced = 0;
    let calendarErrors = 0;

    for (let i = 0; i < hListings.length; i++) {
      const hl = hListings[i];
      const internalId = hostawayToInternalIdMap.get(Number(hl.id));
      if (!internalId) continue;

      try {
        globalThis.syncStatus.message = `Syncing calendar ${i + 1}/${hListings.length}...`;
        await syncCalendarToDb(client, [internalId], startDate, endDate, Number(hl.id));
        calendarsSynced++;
      } catch (calErr: unknown) {
        console.error(
          `   ❌ Calendar failed for ${hl.id}:`,
          (calErr as Error).message
        );
        calendarErrors++;
      }
    }

    console.log(
      `✅ Step 2: ${calendarsSynced} calendars synced (${calendarErrors} errors).`
    );

    globalThis.syncStatus.message = "Syncing reservations...";
    const hReservations = await client.getReservations({ limit: 1000 } as Parameters<
      LivePMSClient["getReservations"]
    >[0]);
    const existingResCount = await Reservation.countDocuments({ orgId: orgOid });

    const mappedReservations = hReservations
      .map((r) => {
        const internalListingId = hostawayToInternalIdMap.get(Number(r.listingMapId));
        if (!internalListingId) return null;
        return { ...r, listingMapId: internalListingId };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (mappedReservations.length > 0) {
      await syncReservationsToDb(mappedReservations as never, new Date());
    }

    const newReservationCount =
      (await Reservation.countDocuments({ orgId: orgOid })) - existingResCount;
    console.log(`✅ Step 3: Reservations synced (${newReservationCount} new).`);

    globalThis.syncStatus.message = "Syncing conversations...";
    const convStats = await syncConversationsToDb(hostawayToInternalIdMap, accessToken);
    console.log(
      `✅ Step 4: ${convStats.synced} conversations (${convStats.errors} errors).`
    );

    globalThis.syncStatus.message = "Refreshing market events...";
    try {
      const eventSync = await syncOrgMarketEvents(orgOid, 90);
      console.log(`✅ Step 5: ${eventSync.totalSaved} market events saved.`);
    } catch (evtErr) {
      console.warn(`⚠️ Step 5: Market events skipped:`, (evtErr as Error).message);
    }

    globalThis.syncStatus = {
      status: "complete",
      message: "Sync completed successfully!",
      orgId,
    };
  } catch (err: unknown) {
    console.error("❌ Hostaway sync error:", err);
    globalThis.syncStatus = {
      status: "error",
      message: (err as Error).message || "Unknown sync error",
      orgId,
    };
  }
}

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (
    globalThis.syncStatus?.status === "syncing" &&
    globalThis.syncStatus.orgId !== session.orgId
  ) {
    return NextResponse.json(
      {
        success: false,
        status: "already_syncing",
        message: "Another organization sync is in progress. Try again shortly.",
      },
      { status: 409 }
    );
  }

  if (globalThis.syncStatus?.status === "syncing") {
    return NextResponse.json(
      {
        success: false,
        status: "already_syncing",
        message: "A sync is already in progress.",
      },
      { status: 409 }
    );
  }

  await performBackgroundSync(session.orgId);

  const final = globalThis.syncStatus;
  return NextResponse.json(
    {
      success: final.status === "complete",
      status: final.status,
      message: final.message,
    },
    { status: final.status === "complete" ? 200 : 500 }
  );
}
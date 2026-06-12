import {
    connectDB,
    Listing,
    Reservation,
    InventoryMaster,
    HostawayConversation,
} from "./db";
import type { PMSClient } from "./pms/types";
import mongoose from "mongoose";

/**
 * Get the maximum syncedAt timestamp from a list of records
 */
export function getMaxSyncedAt(
    records: Array<{ syncedAt: Date | null }>
): Date | null {
    const timestamps = records
        .map((r) => r.syncedAt)
        .filter((t): t is Date => t !== null);

    if (timestamps.length === 0) return null;

    return new Date(Math.max(...timestamps.map((t) => t.getTime())));
}

/**
 * Sync listings to database with upsert by hostawayId
 */
export async function syncListingsToDb(
    pmsListings: Array<{
        id: number;
        name: string;
        area: string;
        bedroomsNumber: number;
        bathroomsNumber: number;
        propertyTypeId: number;
        price: number;
        currencyCode: string;
        personCapacity?: number;
        amenities?: string[];
    }>
) {
    if (pmsListings.length === 0) return;

    await connectDB();

    const bulkOps = pmsListings.map((listing) => ({
        updateOne: {
            filter: { hostawayId: listing.id.toString() },
            update: {
                $set: {
                    hostawayId: listing.id.toString(),
                    name: listing.name,
                    area: listing.area,
                    bedroomsNumber: listing.bedroomsNumber,
                    bathroomsNumber: listing.bathroomsNumber,
                    propertyTypeId: listing.propertyTypeId,
                    price: listing.price,
                    currencyCode: listing.currencyCode,
                    personCapacity: listing.personCapacity,
                    amenities: listing.amenities,
                },
            },
            upsert: true,
        },
    }));

    await Listing.bulkWrite(bulkOps);
}

/**
 * Sync reservations to database — upsert by hostawayReservationId
 */
export async function syncReservationsToDb(
    pmsReservations: Array<{
        id: number;
        listingMapId: mongoose.Types.ObjectId;
        guestName: string;
        guestEmail?: string;
        channelName: string;
        arrivalDate: string;
        departureDate: string;
        nights: number;
        totalPrice: number;
        pricePerNight: number;
        status?: string;
    }>,
    _syncedAt: Date
) {
    if (pmsReservations.length === 0) return;

    await connectDB();

    // Derive orgId from the first listing we can find
    const firstListing = await Listing.findById(pmsReservations[0].listingMapId)
        .select("orgId")
        .lean();
    const orgId =
        firstListing?.orgId || new mongoose.Types.ObjectId();

    const bulkOps = pmsReservations.map((r) => ({
        updateOne: {
            filter: { hostawayReservationId: r.id.toString() },
            update: {
                $set: {
                    hostawayReservationId: r.id.toString(),
                    orgId,
                    listingId: r.listingMapId,
                    guestName: r.guestName,
                    guestEmail: r.guestEmail || undefined,
                    channelName: r.channelName,
                    checkIn: r.arrivalDate,
                    checkOut: r.departureDate,
                    nights: r.nights,
                    totalPrice: r.totalPrice,
                    status: (r.status || "confirmed") as
                        | "confirmed"
                        | "pending"
                        | "cancelled"
                        | "checked_in"
                        | "checked_out"
                        | "inquiry",
                },
            },
            upsert: true,
        },
    }));

    await Reservation.bulkWrite(bulkOps);
}

/**
 * Sync calendar days for listings — upsert by listingId+date
 */
export async function syncCalendarToDb(
    pmsClient: PMSClient,
    listingIds: mongoose.Types.ObjectId[],
    startDate: Date,
    endDate: Date,
    hostawayId?: number
) {
    await connectDB();

    for (const listingId of listingIds) {
        const pmsId = hostawayId || 0;
        if (!pmsId) continue;

        const calendarData = await pmsClient.getCalendar(pmsId, startDate, endDate);

        if (calendarData.length === 0) continue;

        // Lookup orgId from listing
        const listing = await Listing.findById(listingId).select("orgId").lean();
        const orgId = listing?.orgId || new mongoose.Types.ObjectId();

        const bulkOps = calendarData.map((day) => ({
            updateOne: {
                filter: { listingId, date: day.date },
                update: {
                    $set: {
                        orgId,
                        listingId,
                        date: day.date,
                        status: day.status as
                            | "available"
                            | "booked"
                            | "blocked"
                            | "pending",
                        currentPrice: day.price,
                        minStay: day.minimumStay || 1,
                        maxStay: day.maximumStay || 30,
                    },
                },
                upsert: true,
            },
        }));

        // Process in chunks of 100
        for (let i = 0; i < bulkOps.length; i += 100) {
            await InventoryMaster.bulkWrite(bulkOps.slice(i, i + 100));
        }
    }
}

/**
 * Fetch and sync all conversations from Hostaway into DB
 */
export async function syncConversationsToDb(
    hostawayToInternalIdMap: Map<number, mongoose.Types.ObjectId>
) {
    const token = process.env.Hostaway_Authorization_token;
    if (!token) {
        console.error("No Hostaway token for syncing conversations.");
        return { synced: 0, errors: 1 };
    }

    await connectDB();

    try {
        console.log(`📥 Fetching ALL conversations...`);
        const convRes = await fetch(
            `https://api.hostaway.com/v1/conversations?limit=250&offset=0&includeResources=1`,
            {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
            }
        );

        if (convRes.status === 403) {
            console.warn(
                "⚠️ Hostaway API: 403 Forbidden. Your token likely lacks 'Inbox' permissions."
            );
            return { synced: 0, errors: 1 };
        }

        if (!convRes.ok)
            throw new Error(`Hostaway API returned ${convRes.status}`);

        const convJson = await convRes.json();
        const rawConversations = convJson.result || [];

        // Filter to only conversations for known properties
        const mappedConversations = rawConversations.filter((conv: any) => {
            const lid =
                conv.Reservation?.listingMapId || conv.listingMapId;
            return lid && hostawayToInternalIdMap.has(Number(lid));
        });

        console.log(
            `🔍 Syncing ${mappedConversations.length} conversations...`
        );

        let syncedCount = 0;
        let errCount = 0;

        for (const conv of mappedConversations) {
            const hwListingId =
                conv.Reservation?.listingMapId || conv.listingMapId;
            const internalListingId = hostawayToInternalIdMap.get(
                Number(hwListingId)
            );
            if (!internalListingId) continue;

            const convId = conv.id.toString();
            const guestName =
                conv.recipientName ||
                conv.Reservation?.guestName ||
                conv.Reservation?.guestFirstName ||
                "Guest";

            const dateFrom =
                conv.Reservation?.arrivalDate || "2000-01-01";
            const dateTo =
                conv.Reservation?.departureDate || "2099-12-31";

            let messages: {
                sender: string;
                text: string;
                timestamp: string;
            }[] = [];

            try {
                const msgRes = await fetch(
                    `https://api.hostaway.com/v1/conversations/${convId}/messages?limit=50`,
                    {
                        method: "GET",
                        headers: {
                            Authorization: `Bearer ${token}`,
                            "Content-Type": "application/json",
                        },
                    }
                );

                if (msgRes.ok) {
                    const msgJson = await msgRes.json();
                    messages = (msgJson.result || [])
                        .filter((m: any) => m.body && m.body.trim())
                        .map((m: any) => ({
                            sender: m.isIncoming ? "guest" : "admin",
                            text: m.body || "",
                            timestamp: m.insertedOn || m.updatedOn || "",
                        }));
                }

                // Get orgId from listing
                const listing = await Listing.findById(internalListingId)
                    .select("orgId")
                    .lean();
                const orgId =
                    listing?.orgId || new mongoose.Types.ObjectId();

                await HostawayConversation.findOneAndUpdate(
                    { hostawayConversationId: convId },
                    {
                        $set: {
                            orgId,
                            listingId: internalListingId,
                            hostawayConversationId: convId,
                            guestName,
                            guestEmail:
                                conv.guestEmail ||
                                conv.recipientEmail ||
                                undefined,
                            reservationId:
                                conv.reservationId?.toString() || undefined,
                            messages,
                            dateFrom,
                            dateTo,
                            syncedAt: new Date(),
                        },
                    },
                    { upsert: true, new: true }
                );

                syncedCount++;
            } catch (e) {
                console.warn(
                    `   ⚠️  Failed to fetch/save messages for conv ${convId}`
                );
                errCount++;
            }
        }

        return { synced: syncedCount, errors: errCount };
    } catch (error) {
        console.error("Sync Conversations Error:", error);
        return { synced: 0, errors: 1 };
    }
}

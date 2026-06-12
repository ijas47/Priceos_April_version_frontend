import { NextRequest, NextResponse } from "next/server";
import { createPMSClient } from "@/lib/pms";
import {
  syncListingsToDb,
  syncReservationsToDb,
  syncCalendarToDb,
} from "@/lib/sync-server-utils";
import { addDays } from "date-fns";

export async function POST(req: NextRequest) {
  try {
    const { context, propertyId } = await req.json();

    if (!context) {
      return NextResponse.json(
        { success: false, error: "Missing context parameter" },
        { status: 400 }
      );
    }

    const pmsClient = createPMSClient();
    const now = new Date();

    if (context === "portfolio") {
      // Sync all data
      const allListings = await pmsClient.listListings();
      const allReservations = await pmsClient.getReservations();

      // Sync listings to database
      await syncListingsToDb(
        allListings.map((l) => ({
          id: l.id,
          name: l.name,
          area: l.area,
          bedroomsNumber: l.bedroomsNumber,
          bathroomsNumber: l.bathroomsNumber,
          propertyType: l.propertyType,
          price: l.price,
          currencyCode: l.currencyCode,
          priceFloor: l.priceFloor,
          priceCeiling: l.priceCeiling,
          personCapacity: l.personCapacity,
          amenities: l.amenities,
        })),
        now
      );

      // After syncing listings, query database to get actual IDs
      const { db: dbClient, listings: listingsSchema } = await import("@/lib/db");
      const dbListings = await dbClient.select().from(listingsSchema);

      // Create mapping from Hostaway ID to database ID
      const hostawayToDbId = new Map<string, number>();
      for (const listing of dbListings) {
        if (listing.hostawayId) {
          hostawayToDbId.set(listing.hostawayId, listing.id);
        }
      }

      await syncReservationsToDb(
        allReservations.map((r) => ({
          id: r.id,
          listingMapId: r.listingMapId,
          guestName: r.guestName,
          guestEmail: r.guestEmail,
          channelName: r.channelName,
          arrivalDate: r.arrivalDate,
          departureDate: r.departureDate,
          nights: r.nights,
          totalPrice: r.totalPrice,
          pricePerNight: r.pricePerNight,
          status: r.status,
          checkInTime: r.checkInTime,
          checkOutTime: r.checkOutTime,
        })),
        now
      );

      // Sync calendar for all listings (next 90 days) using database IDs
      const startDate = new Date();
      const endDate = addDays(startDate, 90);

      // Map Hostaway IDs to database IDs for calendar sync
      const listingIdsForCalendar = allListings
        .map((l) => ({
          hostawayId: l.id,
          dbId: hostawayToDbId.get(l.id.toString()),
        }))
        .filter((l) => l.dbId !== undefined);

      let totalCalendarDays = 0;
      for (const { hostawayId, dbId } of listingIdsForCalendar) {
        await syncCalendarToDb(
          pmsClient,
          [dbId!],
          startDate,
          endDate,
          now,
          hostawayId
        );
        totalCalendarDays += 90; // Approximate
      }

      return NextResponse.json({
        success: true,
        synced: {
          listings: allListings.length,
          reservations: allReservations.length,
          calendar: totalCalendarDays,
        },
        timestamp: now.toISOString(),
      });
    } else {
      // Property-specific sync is not supported yet due to ID mapping complexity
      // Users should use portfolio sync instead
      return NextResponse.json({
        success: false,
        error:
          "Property-specific sync is not yet supported. Please use portfolio view to sync all properties.",
      }, { status: 400 });
    }
  } catch (error) {
    console.error("Sync failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Sync failed",
      },
      { status: 500 }
    );
  }
}

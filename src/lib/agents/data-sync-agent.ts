import { createHostawayClient } from "../hostaway/client";
import { connectDB, Listing, InventoryMaster, Reservation } from "@/lib/db";
import { addDays, format } from "date-fns";
import mongoose from "mongoose";

const CALENDAR_DAYS = 90;

export interface SyncResult {
  listingId: string;
  listingsSynced: number;
  calendarDaysSynced: number;
  reservationsSynced: number;
  syncedAt: Date;
  errors: string[];
}

/**
 * Data Sync Agent
 * Syncs HostAway data to MongoDB cache
 */
export class DataSyncAgent {
  private hostawayApiKey: string;

  constructor(hostawayApiKey: string) {
    this.hostawayApiKey = hostawayApiKey;
  }

  async isCacheStale(_listingId: mongoose.Types.ObjectId): Promise<boolean> {
    return false;
  }

  async syncProperty(listingId: mongoose.Types.ObjectId): Promise<SyncResult> {
    const client = createHostawayClient(this.hostawayApiKey);
    const errors: string[] = [];
    const syncedAt = new Date();

    try {
      await connectDB();

      const dbListing = await Listing.findById(listingId).lean();
      if (!dbListing?.hostawayId) {
        throw new Error(`Listing ${listingId} has no hostawayId`);
      }

      const hostawayId = parseInt(dbListing.hostawayId);

      const hostawayListing = await client.getListing(hostawayId);

      await Listing.findByIdAndUpdate(listingId, {
        $set: {
          name: hostawayListing.name,
          city: hostawayListing.city,
          countryCode: hostawayListing.countryCode,
          bedroomsNumber: hostawayListing.bedroomsNumber,
          bathroomsNumber: hostawayListing.bathroomsNumber,
          price: hostawayListing.price,
          currencyCode: hostawayListing.currencyCode,
          personCapacity: hostawayListing.personCapacity,
          amenities: hostawayListing.amenities || [],
        },
      });

      const startDate = new Date();
      const endDate = addDays(startDate, CALENDAR_DAYS);

      const calendarData = await client.getCalendar(
        hostawayId,
        format(startDate, "yyyy-MM-dd"),
        format(endDate, "yyyy-MM-dd")
      );

      if (calendarData.length > 0) {
        const bulkOps = calendarData.map((day) => ({
          updateOne: {
            filter: { listingId, date: day.date },
            update: {
              $set: {
                orgId: dbListing.orgId,
                listingId,
                date: day.date,
                status: day.status as "available" | "booked" | "blocked" | "pending",
                currentPrice: day.price,
                minStay: day.minimumStay || 1,
                maxStay: day.maximumStay || 30,
              },
            },
            upsert: true,
          },
        }));
        await InventoryMaster.bulkWrite(bulkOps);
      }

      const reservationsData = await client.getReservations(
        hostawayId,
        format(startDate, "yyyy-MM-dd"),
        format(endDate, "yyyy-MM-dd")
      );

      for (const reservation of reservationsData) {
        await Reservation.findOneAndUpdate(
          {
            listingId,
            checkIn: reservation.arrivalDate,
            guestName: reservation.guestName,
          },
          {
            $set: {
              orgId: dbListing.orgId,
              listingId,
              guestName: reservation.guestName || "Guest",
              guestEmail: reservation.guestEmail,
              checkIn: reservation.arrivalDate,
              checkOut: reservation.departureDate,
              nights: reservation.nights || 1,
              totalPrice: reservation.totalPrice,
              channelName: reservation.channelName,
              status: this.mapReservationStatus(reservation.status),
            },
          },
          { upsert: true }
        );
      }

      return {
        listingId: listingId.toString(),
        listingsSynced: 1,
        calendarDaysSynced: calendarData.length,
        reservationsSynced: reservationsData.length,
        syncedAt,
        errors,
      };
    } catch (error) {
      errors.push((error as Error).message);
      return {
        listingId: listingId.toString(),
        listingsSynced: 0,
        calendarDaysSynced: 0,
        reservationsSynced: 0,
        syncedAt,
        errors,
      };
    }
  }

  async syncAllProperties(): Promise<SyncResult[]> {
    await connectDB();
    const allListings = await Listing.find({ isActive: true }).lean();
    const results: SyncResult[] = [];

    const syncPromises = allListings.map((listing) =>
      this.syncProperty(listing._id as mongoose.Types.ObjectId)
    );

    const syncResults = await Promise.allSettled(syncPromises);

    for (const result of syncResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        console.error("Sync failed:", result.reason);
      }
    }

    return results;
  }

  async initialImport(orgId: mongoose.Types.ObjectId): Promise<{
    success: boolean;
    listingsImported: number;
    error?: string;
  }> {
    try {
      await connectDB();
      const client = createHostawayClient(this.hostawayApiKey);
      const hostawayListings = await client.getListings();

      let importedCount = 0;

      for (const hostawayListing of hostawayListings) {
        const existing = await Listing.findOne({
          hostawayId: hostawayListing.id.toString(),
        });

        if (!existing) {
          const inserted = await Listing.create({
            orgId,
            hostawayId: hostawayListing.id.toString(),
            name: hostawayListing.name,
            city: hostawayListing.city,
            countryCode: hostawayListing.countryCode,
            area: hostawayListing.address || "N/A",
            bedroomsNumber: hostawayListing.bedroomsNumber,
            bathroomsNumber: hostawayListing.bathroomsNumber,
            propertyTypeId: hostawayListing.propertyTypeId,
            price: hostawayListing.price,
            currencyCode: hostawayListing.currencyCode,
            personCapacity: hostawayListing.personCapacity,
            amenities: hostawayListing.amenities || [],
          });

          await this.syncProperty(inserted._id as mongoose.Types.ObjectId);
          importedCount++;
        }
      }

      return { success: true, listingsImported: importedCount };
    } catch (error) {
      return {
        success: false,
        listingsImported: 0,
        error: (error as Error).message,
      };
    }
  }

  private mapReservationStatus(status: string): "confirmed" | "pending" | "cancelled" {
    switch (status) {
      case "new":
      case "modified":
        return "confirmed";
      case "awaiting_payment":
        return "pending";
      case "cancelled":
        return "cancelled";
      default:
        return "confirmed";
    }
  }
}

export function createDataSyncAgent(hostawayApiKey: string): DataSyncAgent {
  return new DataSyncAgent(hostawayApiKey);
}

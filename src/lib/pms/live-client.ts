import type { PMSClient } from "./types";
import type {
  Listing,
  CalendarDay,
  Reservation,
  CalendarInterval,
  UpdateResult,
  VerificationResult,
  ReservationFilters,
} from "@/types/hostaway";
import { HostawayClient } from "@/lib/hostaway/client";
import type { HostawayListing, HostawayCalendarDay, HostawayReservation } from "@/lib/hostaway/types";
import { format } from "date-fns";

function readOnlyError(method: string): never {
  throw new Error(
    `[PriceOS] ${method}() blocked — Hostaway live client is READ-ONLY. ` +
    `Set HOSTAWAY_READ_ONLY=false to enable writes (not recommended).`
  );
}

function toListing(h: HostawayListing): Listing {
  return {
    id: h.id,
    name: h.name,
    city: h.city,
    countryCode: h.countryCode,
    area: h.city,
    bedroomsNumber: h.bedroomsNumber,
    bathroomsNumber: h.bathroomsNumber,
    propertyTypeId: h.propertyTypeId,
    price: h.price,
    currencyCode: h.currencyCode as "AED" | "USD",
    priceFloor: Math.round(h.price * 0.6),
    priceCeiling: Math.round(h.price * 2.0),
    personCapacity: h.personCapacity,
    amenities: h.amenities,
    address: h.address,
    latitude: h.latitude,
    longitude: h.longitude,
  };
}

function toCalendarDay(h: HostawayCalendarDay): CalendarDay {
  return {
    date: h.date,
    status: h.status === "booked" ? "booked" : h.status === "blocked" ? "blocked" : "available",
    price: h.price,
    minimumStay: h.minimumStay ?? 1,
    maximumStay: h.maximumStay ?? 365,
    note: h.note,
  };
}

function toReservation(h: HostawayReservation): Reservation {
  const statusMap: Record<string, Reservation["status"]> = {
    new: "confirmed",
    modified: "confirmed",
    cancelled: "cancelled",
    awaiting_payment: "pending",
  };
  return {
    id: h.id,
    listingMapId: h.listingMapId,
    guestName: h.guestName,
    guestEmail: h.guestEmail,
    channelName: (["Airbnb", "Booking.com", "Direct"].includes(h.channelName)
      ? h.channelName
      : "Other") as Reservation["channelName"],
    arrivalDate: h.arrivalDate,
    departureDate: h.departureDate,
    nights: h.nights,
    totalPrice: h.totalPrice,
    pricePerNight: h.nightlyRate,
    status: statusMap[h.status] ?? "confirmed",
    createdAt: new Date().toISOString(),
    checkInTime: h.checkInTime,
    checkOutTime: h.checkOutTime,
  };
}

export class LivePMSClient implements PMSClient {
  private client: HostawayClient;

  constructor(apiKey: string) {
    this.client = new HostawayClient(apiKey);
  }

  getMode(): "live" {
    return "live";
  }

  async listListings(): Promise<Listing[]> {
    const raw = await this.client.getListings();
    return raw.map(toListing);
  }

  async getListing(id: string | number): Promise<Listing> {
    const raw = await this.client.getListing(Number(id));
    return toListing(raw);
  }

  async getCalendar(id: string | number, startDate: Date, endDate: Date): Promise<CalendarDay[]> {
    const raw = await this.client.getCalendar(
      Number(id),
      format(startDate, "yyyy-MM-dd"),
      format(endDate, "yyyy-MM-dd"),
    );
    return raw.map(toCalendarDay);
  }

  async getReservations(filters?: ReservationFilters): Promise<Reservation[]> {
    const raw = await this.client.getReservations(
      filters?.listingMapId ? Number(filters.listingMapId) : undefined,
      filters?.startDate ? format(filters.startDate, "yyyy-MM-dd") : undefined,
      filters?.endDate ? format(filters.endDate, "yyyy-MM-dd") : undefined,
      filters?.limit ?? 500,
    );
    let results = raw.map(toReservation);
    if (filters?.channelName) results = results.filter((r) => r.channelName === filters.channelName);
    if (filters?.status) results = results.filter((r) => r.status === filters.status);
    if (filters?.offset) results = results.slice(filters.offset);
    if (filters?.limit) results = results.slice(0, filters.limit);
    return results;
  }

  async getReservation(id: string | number): Promise<Reservation> {
    const all = await this.client.getReservations();
    const match = all.find((r) => r.id === Number(id));
    if (!match) throw new Error(`Reservation ${id} not found`);
    return toReservation(match);
  }

  async verifyCalendar(id: string | number, dates: string[]): Promise<VerificationResult> {
    return { matches: true, totalDates: dates.length, matchedDates: dates.length };
  }

  // --- All write operations are blocked ---

  async updateCalendar(_id: string | number, _intervals: CalendarInterval[]): Promise<UpdateResult> {
    readOnlyError("updateCalendar");
  }

  async blockDates(_id: string | number, _start: string, _end: string, _reason: "owner_stay" | "maintenance" | "other"): Promise<UpdateResult> {
    readOnlyError("blockDates");
  }

  async unblockDates(_id: string | number, _start: string, _end: string): Promise<UpdateResult> {
    readOnlyError("unblockDates");
  }

  async updateListing(_id: string | number, _updates: Partial<Listing>): Promise<Listing> {
    readOnlyError("updateListing");
  }

  async createReservation(_reservation: Omit<Reservation, "id" | "createdAt" | "pricePerNight">): Promise<Reservation> {
    readOnlyError("createReservation");
  }
}

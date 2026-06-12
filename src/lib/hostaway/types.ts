// HostAway API Types
// Based on HostAway API v1 documentation

export interface HostawayListing {
  id: number;
  name: string;
  city: string;
  countryCode: string;
  address: string;
  bedroomsNumber: number;
  bathroomsNumber: number;
  propertyType: string;
  propertyTypeId: number;
  price: number;
  currencyCode: string;
  personCapacity: number;
  amenities: string[];
  latitude?: number;
  longitude?: number;
  photos?: Array<{
    id: number;
    url: string;
    sortOrder: number;
  }>;
}

export interface HostawayCalendarDay {
  listingId: number;
  date: string; // YYYY-MM-DD
  status: 'available' | 'booked' | 'blocked';
  price: number;
  minimumStay?: number;
  maximumStay?: number;
  note?: string;
}

export interface HostawayReservation {
  id: number;
  listingMapId: number;
  guestName: string;
  guestEmail?: string;
  channelName: string;
  arrivalDate: string; // YYYY-MM-DD
  departureDate: string; // YYYY-MM-DD
  nights: number;
  totalPrice: number;
  nightlyRate: number;
  status: 'new' | 'modified' | 'cancelled' | 'awaiting_payment';
  checkInTime?: string;
  checkOutTime?: string;
}

export interface HostawayCalendarUpdate {
  date: string; // YYYY-MM-DD
  price?: number;
  status?: 'available' | 'booked' | 'blocked';
  minimumStay?: number;
  maximumStay?: number;
  note?: string;
}

export interface HostawayApiError {
  status: number;
  message: string;
  code?: string;
}

export interface HostawayRateLimit {
  remaining: number;
  limit: number;
  reset: number; // Unix timestamp
}

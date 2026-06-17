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
  description?: string;
  externalListingName?: string;
  internalListingName?: string;
  airbnbName?: string;
  airbnbSummary?: string;
  homeawayPropertyHeadline?: string;
  airbnbListingUrl?: string;
  vrboListingUrl?: string;
  averageReviewRating?: number;
  photos?: Array<{
    id: number;
    url: string;
    sortOrder: number;
    airbnbCaption?: string;
    vrboCaption?: string;
  }>;
}

/** Partial listing update - Hostaway accepts only changed fields. */
export interface HostawayListingUpdate {
  airbnbName?: string;
  airbnbSummary?: string;
  externalListingName?: string;
  homeawayPropertyHeadline?: string;
  description?: string;
}

export interface HostawayCalendarDay {
  listingId: number;
  date: string; // YYYY-MM-DD
  status: 'available' | 'booked' | 'blocked';
  price: number;
  minimumStay?: number;
  maximumStay?: number;
  note?: string;
  /** Hostaway raw field - 1/0 or boolean */
  isAvailable?: number | boolean;
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

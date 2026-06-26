import { Reservation } from "@/types/hostaway";
import { addDays, format } from "date-fns";

/**
 * Mock Reservations Data
 * ~65 bookings across 15 properties over next 90 days
 * Distribution varies per property (high-demand gets more bookings)
 * Channel: Airbnb 50%, Booking.com 30%, Direct 20%
 */

const GUEST_NAMES = [
  "John Smith",
  "Sarah Johnson",
  "Michael Brown",
  "Emma Wilson",
  "David Lee",
  "Lisa Anderson",
  "James Taylor",
  "Maria Garcia",
  "Robert Martin",
  "Jessica White",
  "Christopher Davis",
  "Michelle Rodriguez",
  "Daniel Miller",
  "Nancy Martinez",
  "Matthew Jones",
  "Ahmed Al Maktoum",
  "Fatima Hassan",
  "Oliver Chen",
  "Sophie Laurent",
  "Raj Patel",
  "Anna Petrov",
  "Carlos Mendoza",
  "Yuki Tanaka",
  "Pierre Dubois",
  "Elena Rossi",
];

function getRandomGuest(seed: number): string {
  return GUEST_NAMES[seed % GUEST_NAMES.length];
}

function getRandomChannel(seed: number): string {
  const rand = seed % 10;
  if (rand < 5) return "Airbnb";
  if (rand < 8) return "Booking.com";
  return "Direct";
}

function getRandomNights(seed: number): number {
  const rand = seed % 100;
  if (rand < 25) return 2;
  if (rand < 50) return 3;
  if (rand < 70) return 4;
  if (rand < 85) return 5;
  if (rand < 95) return 7;
  return 10;
}

/**
 * Property booking counts - varied per property
 * High-demand properties get more bookings
 */
const PROPERTY_BOOKING_COUNTS: Record<number, number> = {
  1001: 5,  // Marina Heights 1BR
  1002: 6,  // Downtown Residences 2BR
  1003: 3,  // JBR Beach Studio
  1004: 8,  // Palm Villa 3BR (premium, high demand)
  1005: 4,  // Bay View 1BR
  1006: 3,  // Creek Harbour Studio
  1007: 7,  // DIFC Tower 2BR
  1008: 2,  // JVC Family 3BR (budget)
  1009: 4,  // Marina Walk Studio
  1010: 5,  // Springs Villa 4BR
  1011: 6,  // City Walk 1BR
  1012: 2,  // Silicon Oasis 2BR (budget)
  1013: 3,  // Al Barsha Heights 1BR
  1014: 7,  // Bluewaters 2BR Penthouse (premium)
  1015: 5,  // Arabian Ranches 5BR
};

const PROPERTY_BASE_PRICES: Record<number, number> = {
  1001: 550,
  1002: 850,
  1003: 400,
  1004: 2000,
  1005: 500,
  1006: 380,
  1007: 1200,
  1008: 650,
  1009: 420,
  1010: 1100,
  1011: 750,
  1012: 450,
  1013: 350,
  1014: 1800,
  1015: 1500,
};

/**
 * Simple seeded pseudo-random
 */
function seededRand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function generateMockReservations(): Reservation[] {
  const today = new Date();
  const reservations: Reservation[] = [];
  let reservationId = 1;

  const propertyIds = [
    1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010,
    1011, 1012, 1013, 1014, 1015,
  ];

  for (const propertyId of propertyIds) {
    const bookingCount = PROPERTY_BOOKING_COUNTS[propertyId] || 4;
    const basePrice = PROPERTY_BASE_PRICES[propertyId] || 500;

    for (let j = 0; j < bookingCount; j++) {
      const seed = propertyId * 13 + j * 7 + 42;

      // Spread bookings across next 90 days with varied lead times
      const leadDays = Math.round(3 + seededRand(seed + 1) * 80); // 3-83 day lead
      const arrivalDate = addDays(today, leadDays);

      const nights = getRandomNights(seed);
      const departureDate = addDays(arrivalDate, nights);

      // Price variation per booking (±15%)
      const variation = 0.85 + seededRand(seed + 2) * 0.30;
      const pricePerNight = Math.round(basePrice * variation);
      const totalPrice = pricePerNight * nights;

      // Guest count based on property capacity
      const capacityMap: Record<number, number> = {
        1001: 2, 1002: 4, 1003: 1, 1004: 6, 1005: 2,
        1006: 2, 1007: 4, 1008: 6, 1009: 2, 1010: 8,
        1011: 2, 1012: 4, 1013: 2, 1014: 4, 1015: 10,
      };
      const maxGuests = capacityMap[propertyId] || 2;
      const numberOfGuests = Math.max(1, Math.round(1 + seededRand(seed + 4) * (maxGuests - 1)));

      // Channel commission: Airbnb ~15%, Booking.com ~18%, Direct 0%
      const channel = getRandomChannel(seed);
      const commissionRate = channel === "Airbnb" ? 0.15 : channel === "Booking.com" ? 0.18 : 0;
      const channelCommission = Math.round(totalPrice * commissionRate * 100) / 100;

      // Cleaning fee: scaled by property size
      const cleaningFeeMap: Record<number, number> = {
        1001: 150, 1002: 200, 1003: 100, 1004: 400, 1005: 150,
        1006: 100, 1007: 250, 1008: 200, 1009: 100, 1010: 350,
        1011: 150, 1012: 150, 1013: 100, 1014: 300, 1015: 450,
      };
      const cleaningFee = cleaningFeeMap[propertyId] || 150;

      // ~10% cancellation rate; cancelled bookings get a cancelledAt timestamp
      const isCancelled = seededRand(seed + 5) < 0.10;
      const cancelledAt = isCancelled
        ? new Date(today.getTime() - Math.round(seededRand(seed + 6) * 30) * 24 * 60 * 60 * 1000).toISOString()
        : null;
      const status = isCancelled ? "cancelled" as const : (seededRand(seed + 3) < 0.9 ? "confirmed" as const : "pending" as const);

      reservations.push({
        id: reservationId++,
        listingMapId: propertyId,
        guestName: getRandomGuest(seed + j),
        guestEmail: `guest${reservationId}@example.com`,
        channelName: channel as "Airbnb" | "Booking.com" | "Direct",
        arrivalDate: format(arrivalDate, "yyyy-MM-dd"),
        departureDate: format(departureDate, "yyyy-MM-dd"),
        nights,
        totalPrice,
        pricePerNight,
        status,
        createdAt: new Date().toISOString(),
        checkInTime: "15:00",
        checkOutTime: "11:00",
        numberOfGuests,
        channelCommission,
        cleaningFee,
        cancelledAt,
      });
    }
  }

  // Sort by arrival date
  return reservations.sort(
    (a, b) =>
      new Date(a.arrivalDate).getTime() - new Date(b.arrivalDate).getTime()
  );
}

export const MOCK_RESERVATIONS = generateMockReservations();

/**
 * Get reservations for a specific property
 */
export function getReservationsForProperty(
  listingMapId: number,
  reservations = MOCK_RESERVATIONS
): Reservation[] {
  return reservations.filter((r) => r.listingMapId === listingMapId);
}

/**
 * Get reservations within date range
 */
export function getReservationsInRange(
  startDate: Date,
  endDate: Date,
  reservations = MOCK_RESERVATIONS
): Reservation[] {
  return reservations.filter((r) => {
    const arrival = new Date(r.arrivalDate);
    const departure = new Date(r.departureDate);
    return arrival <= endDate && departure >= startDate;
  });
}

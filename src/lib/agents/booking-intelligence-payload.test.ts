import { describe, expect, it } from "vitest";
import { computeBookingPace } from "@/lib/pricing/booking-pace";
import {
  buildBookingIntelligenceBlock,
  resolveVelocityTrend,
} from "./booking-intelligence-payload";

describe("resolveVelocityTrend", () => {
  it("marks ahead-of-STLY pace as accelerating", () => {
    expect(resolveVelocityTrend(40, 1.15)).toBe("accelerating");
  });

  it("marks weak pace and low occupancy as decelerating", () => {
    expect(resolveVelocityTrend(25, 0.7)).toBe("decelerating");
  });
});

describe("buildBookingIntelligenceBlock", () => {
  it("aggregates channel mix, revenue, and pace windows", () => {
    const bookingPace = computeBookingPace({
      today: "2026-06-01",
      forwardInventory: [
        { date: "2026-06-01", status: "booked" },
        { date: "2026-06-02", status: "available" },
      ],
      forwardReservations: [],
      stlyInventory: [
        { date: "2025-06-01", status: "booked" },
        { date: "2025-06-02", status: "booked" },
      ],
      stlyReservations: [],
      horizons: [30],
    });

    const block = buildBookingIntelligenceBlock({
      asOfDate: "2026-06-26",
      analysisFrom: "2026-06-01",
      analysisTo: "2026-06-30",
      occupancyPct: 74,
      bookedNights: 23,
      bookableNights: 31,
      currency: "AED",
      bookingPace,
      reservations: [
        {
          checkIn: "2026-06-03",
          checkOut: "2026-06-06",
          nights: 3,
          totalPrice: 1650,
          channelName: "Airbnb",
          status: "confirmed",
          createdAt: "2026-05-20",
        },
        {
          checkIn: "2026-06-08",
          checkOut: "2026-06-12",
          nights: 4,
          totalPrice: 2280,
          channelName: "Booking.com",
          status: "confirmed",
          createdAt: "2026-06-01",
        },
        {
          checkIn: "2026-06-15",
          checkOut: "2026-06-16",
          nights: 1,
          totalPrice: 490,
          channelName: "Direct",
          status: "cancelled",
          createdAt: "2026-05-01",
        },
      ],
    });

    expect(block.velocity.trend).toBe("decelerating");
    expect(block.revenue.confirmed_gross).toBe(3930);
    expect(block.revenue.avg_price_per_night).toBeGreaterThan(0);
    expect(block.channel_mix).toHaveLength(2);
    expect(block.channel_mix[0].channel).toBe("Airbnb");
    expect(block.cancellations_in_window).toBe(1);
    expect(block.velocity.pace_windows).toHaveLength(1);
    expect(block.length_of_stay.average_nights).toBe(3.5);
  });
});
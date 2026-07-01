import { describe, expect, it } from "vitest";
import { computeOccupancyMetrics } from "./occupancy-metrics";

describe("computeOccupancyMetrics", () => {
  it("counts pending inventory and reservation overlap as booked", () => {
    const metrics = computeOccupancyMetrics(
      [
        { date: "2026-07-01", status: "booked" },
        { date: "2026-07-02", status: "pending" },
        { date: "2026-07-03", status: "available" },
        { date: "2026-07-04", status: "blocked" },
        { date: "2026-07-05", status: "available" },
      ],
      [
        {
          checkIn: "2026-07-05",
          checkOut: "2026-07-07",
          status: "confirmed",
        },
      ]
    );

    expect(metrics.blockedDays).toBe(1);
    expect(metrics.bookableDays).toBe(4);
    expect(metrics.bookedDays).toBe(3);
    expect(metrics.availableDays).toBe(1);
    expect(metrics.occupancyPct).toBe(75);
  });

  it("returns 0% when no bookable days exist", () => {
    const metrics = computeOccupancyMetrics([
      { date: "2026-07-01", status: "blocked" },
      { date: "2026-07-02", status: "blocked" },
    ]);

    expect(metrics.bookableDays).toBe(0);
    expect(metrics.occupancyPct).toBe(0);
  });
});
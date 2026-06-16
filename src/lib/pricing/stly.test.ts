import { describe, expect, it } from "vitest";
import { buildStlySummary, shiftIsoDate } from "./stly";

describe("shiftIsoDate", () => {
  it("shifts by one year", () => {
    expect(shiftIsoDate("2026-04-15", -1)).toBe("2025-04-15");
  });
});

describe("buildStlySummary", () => {
  it("maps current dates to prior-year inventory and reservation ADR", () => {
    const summary = buildStlySummary(
      "2026-04-14",
      "2026-04-16",
      [
        { date: "2025-04-14", currentPrice: 480, status: "booked" },
        { date: "2025-04-15", currentPrice: 520, status: "available" },
      ],
      [
        {
          checkIn: "2025-04-15",
          checkOut: "2025-04-17",
          nights: 2,
          totalPrice: 1000,
          status: "confirmed",
        },
      ]
    );

    expect(summary.stly_window_from).toBe("2025-04-14");
    expect(summary.days).toHaveLength(3);
    expect(summary.days[0]).toMatchObject({
      date: "2026-04-14",
      stly_date: "2025-04-14",
      stly_rate: 480,
      source: "inventory",
    });
    expect(summary.days[1].stly_rate).toBe(520);
    // Booked STLY: Apr 14 inventory + Apr 16 reservation ADR (500)
    expect(summary.avg_achieved_adr).toBe(490);
    expect(summary.data_coverage_pct).toBeGreaterThan(0);
  });

  it("uses reservation ADR when inventory row is missing", () => {
    const summary = buildStlySummary(
      "2026-06-01",
      "2026-06-01",
      [],
      [
        {
          checkIn: "2025-06-01",
          checkOut: "2025-06-04",
          nights: 3,
          totalPrice: 1650,
          status: "confirmed",
        },
      ]
    );

    expect(summary.days[0]).toMatchObject({
      stly_rate: 550,
      source: "reservation",
      stly_status: "booked",
    });
  });
});
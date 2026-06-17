import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  connectDB: vi.fn(),
  Listing: { find: vi.fn() },
  InventoryMaster: { find: vi.fn() },
  Reservation: { find: vi.fn() },
}));

describe("portfolio-metrics", () => {
  it("module exports loadPortfolioDashboardData", async () => {
    const mod = await import("./portfolio-metrics");
    expect(typeof mod.loadPortfolioDashboardData).toBe("function");
  });
});
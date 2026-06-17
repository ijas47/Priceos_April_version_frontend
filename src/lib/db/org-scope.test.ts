import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  connectDB: vi.fn(),
  Listing: {
    find: vi.fn(),
    countDocuments: vi.fn(),
    updateMany: vi.fn(),
  },
  InventoryMaster: { updateMany: vi.fn() },
  Reservation: { updateMany: vi.fn() },
  Organization: { countDocuments: vi.fn() },
}));

describe("org-scope", () => {
  it("exports findListingsForOrg", async () => {
    const mod = await import("./org-scope");
    expect(typeof mod.findListingsForOrg).toBe("function");
    expect(typeof mod.repairOrgListingScope).toBe("function");
  });
});
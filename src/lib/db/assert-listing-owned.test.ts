import { describe, expect, it, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

vi.mock("@/lib/db", () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
  Listing: { findOne: vi.fn() },
}));

import { Listing } from "@/lib/db";
import { assertListingOwned, ListingAccessError } from "./assert-listing-owned";

describe("assertListingOwned", () => {
  const orgId = new mongoose.Types.ObjectId().toString();
  const listingId = new mongoose.Types.ObjectId().toString();

  beforeEach(() => {
    vi.mocked(Listing.findOne).mockReset();
  });

  it("returns listing when org matches", async () => {
    const doc = { _id: listingId, orgId, name: "Marina 1BR" };
    vi.mocked(Listing.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(doc),
    } as never);

    const result = await assertListingOwned(orgId, listingId);
    expect(result.name).toBe("Marina 1BR");
    expect(Listing.findOne).toHaveBeenCalledWith({
      _id: expect.any(mongoose.Types.ObjectId),
      orgId: expect.any(mongoose.Types.ObjectId),
    });
  });

  it("throws NOT_FOUND when listing belongs to another org", async () => {
    vi.mocked(Listing.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    } as never);

    await expect(assertListingOwned(orgId, listingId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(assertListingOwned(orgId, listingId)).rejects.toBeInstanceOf(
      ListingAccessError
    );
  });
});
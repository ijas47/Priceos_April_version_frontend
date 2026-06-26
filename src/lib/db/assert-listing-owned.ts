import mongoose from "mongoose";
import { connectDB, Listing } from "@/lib/db";
import type { IListing } from "@/lib/db/models/Listing";

export class ListingAccessError extends Error {
  readonly code: "NOT_FOUND" | "FORBIDDEN";

  constructor(code: "NOT_FOUND" | "FORBIDDEN", message: string) {
    super(message);
    this.name = "ListingAccessError";
    this.code = code;
  }
}

type LeanListing = IListing & { _id: mongoose.Types.ObjectId };

/**
 * True SaaS guard: listing must belong to the authenticated org.
 * Returns 404-style NOT_FOUND (not 403) to avoid leaking ObjectIds across tenants.
 */
export async function assertListingOwned(
  orgId: string | mongoose.Types.ObjectId,
  listingId: string | mongoose.Types.ObjectId
): Promise<LeanListing> {
  await connectDB();

  const orgOid =
    typeof orgId === "string" ? new mongoose.Types.ObjectId(orgId) : orgId;
  const lid =
    typeof listingId === "string"
      ? new mongoose.Types.ObjectId(listingId)
      : listingId;

  const listing = await Listing.findOne({ _id: lid, orgId: orgOid }).lean();
  if (!listing) {
    throw new ListingAccessError(
      "NOT_FOUND",
      "Listing not found or access denied"
    );
  }

  return listing as LeanListing;
}

export function orgObjectId(
  orgId: string | mongoose.Types.ObjectId
): mongoose.Types.ObjectId {
  return typeof orgId === "string"
    ? new mongoose.Types.ObjectId(orgId)
    : orgId;
}
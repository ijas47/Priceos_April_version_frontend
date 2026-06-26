import mongoose from "mongoose";
import { connectDB, Listing, InventoryMaster, Reservation, Organization } from "@/lib/db";
import type { IListing } from "@/lib/db/models/Listing";

type LeanListing = IListing & { _id: mongoose.Types.ObjectId };

/**
 * Resolve listings for an org, repairing legacy rows that were synced before orgId
 * was stamped (common cause of empty dashboard / agent chat on production).
 */
export async function findListingsForOrg(
  orgId: string,
  options?: { repair?: boolean }
): Promise<LeanListing[]> {
  await connectDB();
  if (!mongoose.Types.ObjectId.isValid(orgId)) return [];

  const orgOid = new mongoose.Types.ObjectId(orgId);
  const repairAllowed =
    options?.repair !== false &&
    (process.env.ALLOW_ORG_SCOPE_REPAIR === "true" ||
      process.env.NODE_ENV !== "production");
  const repair = repairAllowed;

  let listings = await Listing.find({ orgId: orgOid }).sort({ name: 1 }).lean();
  if (listings.length > 0) return listings;

  // Legacy rows may have orgId stored as a raw string
  const stringScoped = await Listing.find({ orgId: orgId as never })
    .sort({ name: 1 })
    .lean();
  if (stringScoped.length > 0) {
    if (repair) {
      await Listing.updateMany({ orgId: orgId as never }, { $set: { orgId: orgOid } });
      return Listing.find({ orgId: orgOid }).sort({ name: 1 }).lean();
    }
    return stringScoped;
  }

  if (!repair) return [];

  const orphanFilter = {
    hostawayId: { $exists: true, $nin: [null, ""] },
    $or: [{ orgId: { $exists: false } }, { orgId: null }],
  };
  const orphanCount = await Listing.countDocuments(orphanFilter);
  if (orphanCount === 0) return [];

  const [orgCount, totalListings, orgHasScoped] = await Promise.all([
    Organization.countDocuments(),
    Listing.countDocuments(),
    Listing.countDocuments({ orgId: orgOid }),
  ]);

  const scopedElsewhere = await Listing.countDocuments({
    orgId: { $exists: true, $ne: null, $nin: [orgOid, orgId] },
  });

  const shouldClaim =
    orgHasScoped === 0 &&
    orphanCount > 0 &&
    (orgCount === 1 || orphanCount === totalListings || scopedElsewhere === 0);

  if (!shouldClaim) return [];

  const orphans = await Listing.find(orphanFilter).select("_id").lean();
  const orphanIds = orphans.map((l) => l._id);

  await Listing.updateMany(orphanFilter, { $set: { orgId: orgOid } });
  await InventoryMaster.updateMany(
    { listingId: { $in: orphanIds } },
    { $set: { orgId: orgOid } }
  );
  await Reservation.updateMany(
    { listingId: { $in: orphanIds } },
    { $set: { orgId: orgOid } }
  );

  console.info(
    `[org-scope] claimed ${orphanIds.length} orphan listings for org ${orgId}`
  );

  return Listing.find({ orgId: orgOid }).sort({ name: 1 }).lean();
}

export async function repairOrgListingScope(orgId: string): Promise<{
  claimed: number;
  total: number;
}> {
  const before = await Listing.countDocuments({
    orgId: new mongoose.Types.ObjectId(orgId),
  });
  const listings = await findListingsForOrg(orgId, { repair: true });
  return { claimed: Math.max(0, listings.length - before), total: listings.length };
}
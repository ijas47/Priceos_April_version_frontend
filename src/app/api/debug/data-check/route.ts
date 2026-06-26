import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getSession } from "@/lib/auth/server";
import { guardDebugRoute } from "@/lib/api/debug-guard";
import { connectDB, Listing, Reservation, InventoryMaster, Organization } from "@/lib/db";
import { apiBase } from "@/lib/api/absolute-url";
import { createPMSClient } from "@/lib/pms";

export const dynamic = "force-dynamic";

export async function GET() {
  const diagnostics: Record<string, unknown> = {};

  try {
    const session = await getSession();
    const blocked = guardDebugRoute(session);
    if (blocked) return blocked;

    diagnostics.session = {
      orgId: session!.orgId,
      email: session!.email,
      role: session!.role,
    };

    diagnostics.apiBaseUrl = await apiBase();
    diagnostics.envApiUrl = process.env.NEXT_PUBLIC_API_URL ?? "(not set, defaults to /api)";
    diagnostics.hostawayMode = process.env.HOSTAWAY_MODE ?? "(not set, defaults to db)";

    const pmsClient = createPMSClient();
    diagnostics.pmsClientMode = pmsClient.getMode();

    await connectDB();
    diagnostics.mongoConnected = true;

    const orgOid = new mongoose.Types.ObjectId(session!.orgId);

    const org = await Organization.findById(orgOid).select("name email").lean();
    diagnostics.orgExists = !!org;
    diagnostics.orgName = org?.name ?? "NOT FOUND";

    const totalListings = await Listing.countDocuments();
    const orgListings = await Listing.countDocuments({ orgId: orgOid });
    const listingsNoOrg = await Listing.countDocuments({ orgId: { $exists: false } });
    const listingsNullOrg = await Listing.countDocuments({ orgId: null });

    diagnostics.listings = {
      total: totalListings,
      belongingToYourOrg: orgListings,
      noOrgId: listingsNoOrg,
      nullOrgId: listingsNullOrg,
    };

    const sampleListing = await Listing.findOne().select("name orgId hostawayId").lean();
    if (sampleListing) {
      diagnostics.sampleListing = {
        name: sampleListing.name,
        orgId: sampleListing.orgId?.toString() ?? "null",
        orgIdType: sampleListing.orgId ? typeof sampleListing.orgId : "null",
        hostawayId: sampleListing.hostawayId ?? "null",
      };
    }

    const totalReservations = await Reservation.countDocuments();
    const orgReservations = await Reservation.countDocuments({ orgId: orgOid });
    diagnostics.reservations = { total: totalReservations, belongingToYourOrg: orgReservations };

    const totalInventory = await InventoryMaster.countDocuments();
    const orgInventory = await InventoryMaster.countDocuments({ orgId: orgOid });
    diagnostics.inventory = { total: totalInventory, belongingToYourOrg: orgInventory };

    diagnostics.verdict =
      orgListings > 0
        ? `OK - ${orgListings} listings found for your org`
        : totalListings > 0
          ? `BUG - ${totalListings} listings exist but none match your orgId (${session!.orgId}). Likely orgId mismatch.`
          : "NO DATA - run Hostaway sync first (Sync page → Import from Hostaway)";
  } catch (err: unknown) {
    diagnostics.error = (err as Error).message;
    diagnostics.stack = (err as Error).stack?.split("\n").slice(0, 5);
  }

  return NextResponse.json(diagnostics);
}

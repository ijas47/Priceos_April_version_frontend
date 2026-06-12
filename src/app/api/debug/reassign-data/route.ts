import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getSession } from "@/lib/auth/server";
import { connectDB, Listing, Reservation, InventoryMaster, HostawayConversation } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/debug/reassign-data
 * Reassigns all orphaned or mismatched listings/reservations/inventory
 * to the current session's orgId. Single-tenant fix for early deployments
 * where data was synced under a different account.
 */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const targetOrgId = new mongoose.Types.ObjectId(session.orgId);

  const listingResult = await Listing.updateMany(
    { orgId: { $ne: targetOrgId } },
    { $set: { orgId: targetOrgId } }
  );

  const reservationResult = await Reservation.updateMany(
    { orgId: { $ne: targetOrgId } },
    { $set: { orgId: targetOrgId } }
  );

  const inventoryResult = await InventoryMaster.updateMany(
    { orgId: { $ne: targetOrgId } },
    { $set: { orgId: targetOrgId } }
  );

  let conversationCount = 0;
  try {
    const convResult = await HostawayConversation.updateMany(
      { orgId: { $ne: targetOrgId } },
      { $set: { orgId: targetOrgId } }
    );
    conversationCount = convResult.modifiedCount;
  } catch {
    // HostawayConversation may not have orgId field
  }

  return NextResponse.json({
    success: true,
    reassignedTo: session.orgId,
    listings: listingResult.modifiedCount,
    reservations: reservationResult.modifiedCount,
    inventory: inventoryResult.modifiedCount,
    conversations: conversationCount,
    message: "All data reassigned. Refresh the dashboard.",
  });
}

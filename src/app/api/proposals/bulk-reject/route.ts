import { NextRequest, NextResponse } from "next/server";
import { connectDB, InventoryMaster } from "@/lib/db";
import { getSession } from "@/lib/auth/server";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { proposalIds } = await req.json();
    if (!Array.isArray(proposalIds) || proposalIds.length === 0) {
      return NextResponse.json({ error: "Invalid proposal IDs" }, { status: 400 });
    }

    await connectDB();
    const result = await InventoryMaster.updateMany(
      { _id: { $in: proposalIds }, orgId: session.orgId, proposalStatus: "pending" },
      { $set: { proposalStatus: "rejected", proposedPrice: null, changePct: null } }
    );

    return NextResponse.json({ success: true, count: result.modifiedCount });
  } catch (error) {
    console.error("[Proposals bulk-reject]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

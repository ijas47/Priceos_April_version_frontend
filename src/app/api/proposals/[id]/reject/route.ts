import { NextRequest, NextResponse } from "next/server";
import { connectDB, InventoryMaster } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import mongoose from "mongoose";

/**
 * POST /api/proposals/[id]/reject
 * Reject a single pending pricing proposal.
 * Clears the proposedPrice and sets proposalStatus to "rejected".
 * No PMS write occurs — only MongoDB update.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid proposal ID" }, { status: 400 });
    }

    await connectDB();

    const proposal = await InventoryMaster.findOne({
      _id: new mongoose.Types.ObjectId(id),
      orgId: session.orgId,
    }).lean();

    if (!proposal) {
      return NextResponse.json(
        { error: "Proposal not found or access denied" },
        { status: 404 }
      );
    }

    if (proposal.proposalStatus !== "pending") {
      return NextResponse.json(
        { error: `Cannot reject a proposal with status "${proposal.proposalStatus}"` },
        { status: 400 }
      );
    }

    const updated = await InventoryMaster.findByIdAndUpdate(
      new mongoose.Types.ObjectId(id),
      {
        $set: {
          proposalStatus: "rejected",
          proposedPrice: null,
          changePct: null,
          riskLevel: null,
          guardVerdict: null,
        },
      },
      { new: true }
    ).lean();

    return NextResponse.json({
      success: true,
      message: `Proposal for ${proposal.date} rejected.`,
      id,
      date: proposal.date,
      currentPrice: Number(proposal.currentPrice),
    });
  } catch (error) {
    console.error("[Proposals reject]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

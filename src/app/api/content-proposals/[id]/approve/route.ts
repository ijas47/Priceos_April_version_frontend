import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { getSession } from "@/lib/auth/server";
import { connectDB, ContentProposal } from "@/lib/db";
import { createContentSyncAgentForOrg } from "@/lib/listing-content/content-sync-agent";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid proposal ID" }, { status: 400 });
    }

    await connectDB();
    const proposal = await ContentProposal.findOne({
      _id: new mongoose.Types.ObjectId(id),
      orgId: session.orgId,
      status: "pending",
    }).lean();

    if (!proposal) {
      return NextResponse.json({ error: "Pending proposal not found" }, { status: 404 });
    }

    await ContentProposal.findByIdAndUpdate(id, { $set: { status: "approved" } });

    const agent = await createContentSyncAgentForOrg(session.orgId);
    if (!agent) {
      await ContentProposal.findByIdAndUpdate(id, { $set: { status: "pending" } });
      return NextResponse.json(
        {
          success: false,
          error: "Hostaway API key not configured — cannot publish content",
        },
        { status: 400 }
      );
    }

    const result = await agent.executeProposal(id);

    if (!result.success) {
      await ContentProposal.findByIdAndUpdate(id, { $set: { status: "pending" } });
      return NextResponse.json(
        { success: false, error: result.error || "Publish failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      verified: result.verified,
      message: result.verified
        ? "Content published and verified on Hostaway"
        : "Content published — verification pending (check Hostaway sync)",
    });
  } catch (error) {
    console.error("[content approve]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
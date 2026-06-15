import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { getSession } from "@/lib/auth/server";
import { runListingOptimizer } from "@/lib/listing-content/optimizer";
import { persistContentProposals } from "@/lib/listing-content/proposals";

export const dynamic = "force-dynamic";

/** POST /api/listings/[id]/content/optimize — generate HITL content proposals */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid listing ID" }, { status: 400 });
    }

    const orgId = new mongoose.Types.ObjectId(session.orgId);
    const listingId = new mongoose.Types.ObjectId(id);

    const result = await runListingOptimizer({ orgId, listingId });
    const batchId = `content-${Date.now()}`;
    const saved = await persistContentProposals({ orgId, listingId, result, batchId });

    return NextResponse.json({
      success: true,
      batchId,
      source: result.source,
      audit: result.audit,
      proposalCount: saved,
    });
  } catch (error) {
    console.error("[content optimize]", error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 400 }
    );
  }
}
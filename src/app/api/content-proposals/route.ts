import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { getSession } from "@/lib/auth/server";
import { connectDB, ContentProposal } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/content-proposals?listingId=&status=pending */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const listingId = req.nextUrl.searchParams.get("listingId");
    const status = req.nextUrl.searchParams.get("status") || "pending";

    await connectDB();
    const filter: Record<string, unknown> = {
      orgId: new mongoose.Types.ObjectId(session.orgId),
      status,
    };
    if (listingId && mongoose.Types.ObjectId.isValid(listingId)) {
      filter.listingId = new mongoose.Types.ObjectId(listingId);
    }

    const docs = await ContentProposal.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return NextResponse.json({
      proposals: docs.map((p) => ({
        id: p._id.toString(),
        listingId: p.listingId.toString(),
        channel: p.channel,
        field: p.field,
        currentValue: p.currentValue,
        proposedValue: p.proposedValue,
        reasoning: p.reasoning,
        visibilityDelta: p.visibilityDelta,
        risk: p.risk,
        status: p.status,
        createdAt: p.createdAt,
      })),
    });
  } catch (error) {
    console.error("[content-proposals GET]", error);
    return NextResponse.json({ error: "Failed to list proposals" }, { status: 500 });
  }
}
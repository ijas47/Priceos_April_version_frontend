import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { getSession } from "@/lib/auth/server";
import { connectDB, ContentProposal, Listing, ListingContentSnapshot } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/listings/[id]/content - snapshot + pending proposals */
export async function GET(
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

    await connectDB();
    const orgId = new mongoose.Types.ObjectId(session.orgId);
    const listingId = new mongoose.Types.ObjectId(id);

    const listing = await Listing.findOne({ _id: listingId, orgId })
      .select("name area city hostawayId bedroomsNumber")
      .lean();
    if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });

    const [snapshot, proposals] = await Promise.all([
      ListingContentSnapshot.findOne({ orgId, listingId }).lean(),
      ContentProposal.find({ orgId, listingId, status: "pending" })
        .sort({ visibilityDelta: -1 })
        .lean(),
    ]);

    return NextResponse.json({
      listing: {
        id: listing._id.toString(),
        name: listing.name,
        area: listing.area,
        city: listing.city,
        hostawayId: listing.hostawayId,
        bedroomsNumber: listing.bedroomsNumber,
      },
      snapshot: snapshot
        ? {
            id: snapshot._id.toString(),
            visibilityScore: snapshot.visibilityScore,
            channelScores: snapshot.channelScores,
            channels: snapshot.channels,
            shared: snapshot.shared,
            capturedAt: snapshot.capturedAt,
          }
        : null,
      proposals: proposals.map((p) => ({
        id: p._id.toString(),
        channel: p.channel,
        field: p.field,
        currentValue: p.currentValue,
        proposedValue: p.proposedValue,
        reasoning: p.reasoning,
        visibilityDelta: p.visibilityDelta,
        expectedImpact: p.expectedImpact,
        risk: p.risk,
        status: p.status,
        batchId: p.batchId,
        createdAt: p.createdAt,
      })),
    });
  } catch (error) {
    console.error("[content GET]", error);
    return NextResponse.json({ error: "Failed to load content" }, { status: 500 });
  }
}
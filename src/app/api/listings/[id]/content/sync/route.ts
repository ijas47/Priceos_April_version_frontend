import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { getSession } from "@/lib/auth/server";
import { syncListingContentFromHostaway } from "@/lib/listing-content/snapshot";

export const dynamic = "force-dynamic";

/** POST /api/listings/[id]/content/sync - pull live content from Hostaway */
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

    const result = await syncListingContentFromHostaway({
      orgId: new mongoose.Types.ObjectId(session.orgId),
      listingId: new mongoose.Types.ObjectId(id),
    });

    return NextResponse.json({
      success: true,
      snapshotId: result.snapshotId,
      visibilityScore: result.visibilityScore,
    });
  } catch (error) {
    console.error("[content sync]", error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 400 }
    );
  }
}
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { getSession } from "@/lib/auth/server";
import { connectDB, ContentProposal } from "@/lib/db";

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
    const updated = await ContentProposal.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(id),
        orgId: session.orgId,
        status: "pending",
      },
      { $set: { status: "rejected" } },
      { new: true }
    ).lean();

    if (!updated) {
      return NextResponse.json({ error: "Pending proposal not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[content reject]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
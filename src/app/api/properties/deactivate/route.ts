import { NextRequest, NextResponse } from "next/server";
import { connectDB, Listing } from "@/lib/db";
import { getSession } from "@/lib/auth/server";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    await connectDB();
    const updated = await Listing.findOneAndUpdate(
      { _id: id, orgId: session.orgId },
      { $set: { isActive: false } },
      { new: true }
    ).lean();

    if (!updated) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Properties deactivate]", error);
    return NextResponse.json({ error: "Failed to deactivate" }, { status: 500 });
  }
}

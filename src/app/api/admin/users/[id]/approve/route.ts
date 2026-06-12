import { NextRequest, NextResponse } from "next/server";
import { connectDB, Organization } from "@/lib/db";
import { getSession } from "@/lib/auth/server";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.role !== "owner" && session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    await connectDB();
    const updated = await Organization.findByIdAndUpdate(
      id,
      { $set: { isApproved: true } },
      { new: true }
    ).lean();

    if (!updated) return NextResponse.json({ error: "User not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Admin approve]", error);
    return NextResponse.json({ error: "Failed to approve user" }, { status: 500 });
  }
}

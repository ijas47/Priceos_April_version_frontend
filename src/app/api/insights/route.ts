import { NextRequest, NextResponse } from "next/server";
import { connectDB, Insight } from "@/lib/db";
import { requireSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    await connectDB();

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const severity = searchParams.get("severity");
    const category = searchParams.get("category");
    const listingId = searchParams.get("listingId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);

    const query: Record<string, unknown> = { orgId: session.orgId };
    if (status) query.status = status;
    if (severity) query.severity = severity;
    if (category) query.category = category;
    if (listingId) query.listingId = listingId;

    // For snoozed, only show ones whose snooze hasn't expired
    if (status === "snoozed") {
      query.snoozeUntil = { $gt: new Date() };
    }

    const [insights, pendingCount] = await Promise.all([
      Insight.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate("listingId", "name area")
        .lean(),
      Insight.countDocuments({ orgId: session.orgId, status: "pending" }),
    ]);

    return NextResponse.json({ success: true, insights, pendingCount });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[Insights GET]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    await connectDB();
    const body = await req.json();

    const insight = await Insight.create({ ...body, orgId: session.orgId });
    return NextResponse.json({ success: true, insight }, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[Insights POST]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

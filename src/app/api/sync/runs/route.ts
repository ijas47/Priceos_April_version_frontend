import { NextRequest, NextResponse } from "next/server";
import { connectDB, SourceRun } from "@/lib/db";
import { requireSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    await connectDB();

    const { searchParams } = new URL(req.url);
    const sourceId = searchParams.get("sourceId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);

    const query: Record<string, unknown> = { orgId: session.orgId };
    if (sourceId) query.sourceId = sourceId;

    const runs = await SourceRun.find(query)
      .sort({ startedAt: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json({ success: true, runs });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[Sync/Runs GET]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

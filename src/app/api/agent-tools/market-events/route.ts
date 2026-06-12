import { NextRequest, NextResponse } from "next/server";
import { connectDB, MarketEvent } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { format, addDays } from "date-fns";

export const dynamic = "force-dynamic";

/** GET /api/agent-tools/market-events?dateFrom&dateTo — events in range. */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get("dateFrom") ?? format(new Date(), "yyyy-MM-dd");
    const dateTo = searchParams.get("dateTo") ?? format(addDays(new Date(), 89), "yyyy-MM-dd");

    const docs = await MarketEvent.find({
      orgId: session.orgId,
      isActive: { $ne: false },
      startDate: { $lte: dateTo },
      endDate: { $gte: dateFrom },
    })
      .sort({ startDate: 1 })
      .limit(200)
      .lean();

    const events = docs.map((e) => ({
      id: e._id.toString(),
      name: e.name,
      startDate: e.startDate,
      endDate: e.endDate,
      impactLevel: e.impactLevel,
      upliftPct: e.upliftPct ?? 0,
      description: (e as unknown as Record<string, unknown>).description ?? "",
      category: (e as unknown as Record<string, unknown>).category ?? "General",
      area: (e as unknown as Record<string, unknown>).area ?? "",
      source: e.source,
    }));

    return NextResponse.json({ events });
  } catch (error) {
    console.error("[Agent-tools market-events]", error);
    return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
  }
}

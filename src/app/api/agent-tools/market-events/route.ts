import { NextRequest, NextResponse } from "next/server";
import { connectDB, MarketEvent } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { format, addDays } from "date-fns";
import { scoreMarketEvent, compareEventSignals, confidenceFromSource } from "@/lib/research/event-scoring";

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
      .limit(300)
      .lean();

    const events = docs
      .map((e) => {
        const confidence =
          e.confidence != null ? Number(e.confidence) : confidenceFromSource(e.source);
        const scored = scoreMarketEvent({
          source: e.source,
          impactLevel: e.impactLevel,
          upliftPct: e.upliftPct,
          confidence,
          startDate: e.startDate,
        });
        const desc = String((e as unknown as Record<string, unknown>).description ?? "");
        const isNews = e.source === "newsapi" || desc.includes("[news]");
        return {
          id: e._id.toString(),
          name: e.name,
          startDate: e.startDate,
          endDate: e.endDate,
          impactLevel: e.impactLevel,
          upliftPct: e.upliftPct ?? 0,
          description: desc,
          category: isNews ? "News" : "Event",
          area: (e as unknown as Record<string, unknown>).area ?? "",
          source: e.source,
          confidence,
          signalScore: scored.signalScore,
          verified: scored.verified,
        };
      })
      .sort(compareEventSignals);

    const sourceCounts = events.reduce<Record<string, number>>((acc, e) => {
      acc[e.source] = (acc[e.source] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({ events, sourceCounts });
  } catch (error) {
    console.error("[Agent-tools market-events]", error);
    return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { connectDB, MarketEvent } from "@/lib/db";
import { getSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    await connectDB();

    const { searchParams } = new URL(req.url);
    const listingId = searchParams.get("listingId");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const impactLevel = searchParams.get("impactLevel");

    // Build query — scope by org if authenticated, else allow portfolio view
    const query: Record<string, unknown> = {};
    if (session?.orgId) {
      query.orgId = session.orgId;
    }
    if (listingId) {
      query.$or = [{ listingId }, { listingId: null }];
    }
    if (dateFrom) query.endDate = { $gte: dateFrom };
    if (dateTo) query.startDate = { $lte: dateTo };
    if (impactLevel) query.impactLevel = impactLevel;

    const events = await MarketEvent.find(query)
      .sort({ startDate: 1 })
      .limit(100)
      .lean();

    return NextResponse.json({ success: true, events });
  } catch (error) {
    console.error("[Events GET]", error);
    return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const body = await req.json();

    const event = await MarketEvent.create({
      ...body,
      orgId: session.orgId,
      source: body.source || "manual",
    });

    return NextResponse.json({ success: true, event }, { status: 201 });
  } catch (error) {
    console.error("[Events POST]", error);
    return NextResponse.json({ error: "Failed to create event" }, { status: 500 });
  }
}

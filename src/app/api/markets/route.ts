import { NextResponse } from "next/server";
import { connectDB, MarketTemplate } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/markets — available market templates (public list for onboarding). */
export async function GET() {
  try {
    await connectDB();
    const docs = await MarketTemplate.find({})
      .select("marketCode displayName country currency timezone flag")
      .sort({ displayName: 1 })
      .lean();

    const markets = docs.map((m) => ({
      id: m._id.toString(),
      marketCode: m.marketCode,
      displayName: m.displayName,
      country: m.country,
      currency: m.currency,
      timezone: m.timezone,
      flag: (m as unknown as Record<string, unknown>).flag ?? "",
    }));

    return NextResponse.json({ markets });
  } catch (error) {
    console.error("[Markets GET]", error);
    return NextResponse.json({ error: "Failed to fetch markets" }, { status: 500 });
  }
}

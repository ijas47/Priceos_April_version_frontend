import { NextRequest, NextResponse } from "next/server";
import { connectDB, InventoryMaster } from "@/lib/db";
import { getSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/** GET /api/inventory/portfolio?startDate&endDate — org-wide inventory days. */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const query: Record<string, unknown> = { orgId: session.orgId };
    if (startDate && endDate) query.date = { $gte: startDate, $lte: endDate };

    const docs = await InventoryMaster.find(query)
      .select("listingId date status currentPrice")
      .limit(20000)
      .lean();

    const inventory = docs.map((d) => ({
      listingId: d.listingId?.toString(),
      date: d.date,
      status: d.status,
      price: d.currentPrice,
    }));

    return NextResponse.json({ inventory });
  } catch (error) {
    console.error("[Inventory portfolio GET]", error);
    return NextResponse.json({ error: "Failed to fetch inventory" }, { status: 500 });
  }
}

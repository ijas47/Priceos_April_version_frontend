import { NextResponse } from "next/server";
import { connectDB, Listing } from "@/lib/db";
import { getSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/** GET /api/listings — all listings for the session org. */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const docs = await Listing.find({ orgId: session.orgId }).sort({ name: 1 }).lean();

    const listings = docs.map((l) => ({
      ...l,
      id: l._id.toString(),
      _id: l._id.toString(),
      orgId: l.orgId?.toString(),
    }));

    return NextResponse.json({ listings });
  } catch (error) {
    console.error("[Listings GET]", error);
    return NextResponse.json({ error: "Failed to fetch listings" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { findListingsForOrg } from "@/lib/db/org-scope";
import { getSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/** GET /api/listings — all listings for the session org. */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const docs = await findListingsForOrg(session.orgId, { repair: true });

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

import { NextRequest, NextResponse } from "next/server";
import { connectDB, Listing } from "@/lib/db";
import { getSession } from "@/lib/auth/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await connectDB();
    const session = await getSession();

    const query: Record<string, unknown> = { _id: id };
    if (session?.orgId) query.orgId = session.orgId;

    const listing = await Listing.findOne(query).lean();
    if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });

    return NextResponse.json({ success: true, listing });
  } catch (error) {
    console.error("[Listings GET/:id]", error);
    return NextResponse.json({ error: "Failed to fetch listing" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const body = await req.json();

    const listing = await Listing.findOneAndUpdate(
      { _id: id, orgId: session.orgId },
      { $set: body },
      { new: true }
    ).lean();

    if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    return NextResponse.json({ success: true, listing });
  } catch (error) {
    console.error("[Listings PUT/:id]", error);
    return NextResponse.json({ error: "Failed to update listing" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const body = await req.json();

    // PATCH is for partial updates — typically price guardrails
    const { priceFloor, priceCeiling, ...rest } = body;
    const updates: Record<string, unknown> = { ...rest };
    if (priceFloor !== undefined) updates.priceFloor = Number(priceFloor);
    if (priceCeiling !== undefined) updates.priceCeiling = Number(priceCeiling);

    const listing = await Listing.findOneAndUpdate(
      { _id: id, orgId: session.orgId },
      { $set: updates },
      { new: true }
    ).lean();

    if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    return NextResponse.json({ success: true, listing });
  } catch (error) {
    console.error("[Listings PATCH/:id]", error);
    return NextResponse.json({ error: "Failed to update listing" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const result = await Listing.findOneAndUpdate(
      { _id: id, orgId: session.orgId },
      { $set: { isActive: false } }
    );

    if (!result) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Listings DELETE/:id]", error);
    return NextResponse.json({ error: "Failed to delete listing" }, { status: 500 });
  }
}

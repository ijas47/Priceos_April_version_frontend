import { NextRequest, NextResponse } from "next/server";
import { connectDB, Reservation } from "@/lib/db";
import { getSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    await connectDB();

    const { searchParams } = new URL(req.url);
    const context = searchParams.get("context");
    const propertyId = searchParams.get("propertyId");
    const status = searchParams.get("status");

    const query: Record<string, unknown> = {};
    if (session?.orgId) query.orgId = session.orgId;
    if (context === "property" && propertyId) query.listingId = propertyId;
    if (status) query.status = status;

    const reservations = await Reservation.find(query)
      .sort({ checkIn: -1 })
      .limit(500)
      .lean();

    return NextResponse.json({ success: true, reservations });
  } catch (error) {
    console.error("[Reservations GET]", error);
    return NextResponse.json({ error: "Failed to fetch reservations" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const body = await req.json();

    const reservation = await Reservation.create({ ...body, orgId: session.orgId });
    return NextResponse.json({ success: true, reservation }, { status: 201 });
  } catch (error) {
    console.error("[Reservations POST]", error);
    return NextResponse.json({ error: "Failed to create reservation" }, { status: 500 });
  }
}

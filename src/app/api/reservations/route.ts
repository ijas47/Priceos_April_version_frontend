import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB, Reservation } from "@/lib/db";
import { getSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    await connectDB();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const context = searchParams.get("context");
    const propertyId = searchParams.get("propertyId");
    const listingId = searchParams.get("listingId");
    const status = searchParams.get("status");
    const checkIn = searchParams.get("checkIn");
    const checkOut = searchParams.get("checkOut");

    const query: Record<string, unknown> = {
      orgId: new mongoose.Types.ObjectId(session.orgId),
    };
    if (context === "property" && propertyId) {
      query.listingId = new mongoose.Types.ObjectId(propertyId);
    }
    if (listingId) {
      query.listingId = new mongoose.Types.ObjectId(listingId);
    }
    if (status) query.status = status;
    else query.status = { $ne: "cancelled" };

    if (checkIn && checkOut) {
      query.checkIn = { $lte: checkOut };
      query.checkOut = { $gte: checkIn };
    }

    const reservations = await Reservation.find(query)
      .sort({ checkIn: -1 })
      .limit(5000)
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

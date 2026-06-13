import { NextRequest, NextResponse } from "next/server";
import { createPMSClient } from "@/lib/pms";
import { getSession } from "@/lib/auth/server";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { propertyId, startDate, endDate, reason } = body;
    if (!propertyId || !startDate || !endDate || !reason) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    const pms = createPMSClient();
    const result = await pms.blockDates(propertyId, startDate, endDate, reason);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[calendar/block]", error.message);
    return NextResponse.json({ error: "Failed to block dates" }, { status: 500 });
  }
}

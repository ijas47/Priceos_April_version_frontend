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
    const { propertyId, startDate, endDate } = body;
    if (!propertyId || !startDate || !endDate) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    const pms = createPMSClient();
    const result = await pms.unblockDates(propertyId, startDate, endDate);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[calendar/unblock]", error.message);
    return NextResponse.json({ error: "Failed to unblock dates" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createPMSClient } from "@/lib/pms";
import { getSession } from "@/lib/auth/server";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");

    if (!propertyId) {
      return NextResponse.json({ error: "propertyId is required" }, { status: 400 });
    }

    const pms = createPMSClient();
    const today = new Date();
    const endDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    const days = await pms.getCalendar(Number(propertyId), today, endDate);

    return NextResponse.json(days);
  } catch (error: any) {
    console.error("[calendar]", error.message);
    return NextResponse.json({ error: "Failed to fetch calendar" }, { status: 500 });
  }
}

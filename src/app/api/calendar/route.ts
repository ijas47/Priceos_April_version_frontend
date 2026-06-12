import { NextRequest, NextResponse } from "next/server";
import { createPMSClient } from "@/lib/pms";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const propertyId = searchParams.get("propertyId");

  if (!propertyId) {
    return NextResponse.json([], { status: 400 });
  }

  const pms = createPMSClient();
  const today = new Date();
  const endDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

  const days = await pms.getCalendar(Number(propertyId), today, endDate);

  return NextResponse.json(days);
}

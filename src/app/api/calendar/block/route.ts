import { NextRequest, NextResponse } from "next/server";
import { createPMSClient } from "@/lib/pms";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { propertyId, startDate, endDate, reason } = body;
  if (!propertyId || !startDate || !endDate || !reason) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  const pms = createPMSClient();
  const result = await pms.blockDates(propertyId, startDate, endDate, reason);
  return NextResponse.json(result);
}

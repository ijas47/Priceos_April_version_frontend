import { NextResponse } from "next/server";
import { connectDB, Detector } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectDB();
    const detectors = await Detector.find({}).sort({ detectorId: 1 }).lean();
    return NextResponse.json({ success: true, detectors });
  } catch (error) {
    console.error("[Sync/Detectors GET]", error);
    return NextResponse.json({ error: "Failed to fetch detectors" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { connectDB, Source } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectDB();
    const sources = await Source.find({}).sort({ sourceId: 1 }).lean();
    return NextResponse.json({ success: true, sources });
  } catch (error) {
    console.error("[Sync/Sources GET]", error);
    return NextResponse.json({ error: "Failed to fetch sources" }, { status: 500 });
  }
}

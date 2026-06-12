import { NextResponse } from "next/server";
import { connectDB, MarketTemplate } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectDB();
    const templates = await MarketTemplate.find({ isActive: true }).sort({ displayName: 1 }).lean();
    return NextResponse.json({ success: true, templates });
  } catch (error) {
    console.error("[MarketTemplates GET]", error);
    return NextResponse.json({ error: "Failed to fetch market templates" }, { status: 500 });
  }
}

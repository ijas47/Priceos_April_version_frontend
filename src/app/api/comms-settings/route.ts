import { NextRequest, NextResponse } from "next/server";
import { connectDB, Organization } from "@/lib/db";
import { getSession } from "@/lib/auth/server";

/**
 * GET /api/comms-settings - returns the org's inbox comms toggles.
 * Returns { liveMode, autoReply }.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const org = await Organization.findById(session.orgId).select("settings.comms").lean();
    const comms = org?.settings?.comms ?? { liveMode: false, autoReply: false };
    return NextResponse.json({ liveMode: !!comms.liveMode, autoReply: !!comms.autoReply });
  } catch (error: any) {
    console.error("[comms-settings GET]", error);
    return NextResponse.json({ error: "Failed to load comms settings" }, { status: 500 });
  }
}

/**
 * PUT /api/comms-settings - persists the org's inbox comms toggles.
 * Body: { liveMode, autoReply }
 */
export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    await connectDB();
    await Organization.findByIdAndUpdate(session.orgId, {
      $set: {
        "settings.comms.liveMode": !!body.liveMode,
        "settings.comms.autoReply": !!body.autoReply,
      },
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[comms-settings PUT]", error);
    return NextResponse.json({ error: "Failed to save comms settings" }, { status: 500 });
  }
}

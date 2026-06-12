import { NextRequest, NextResponse } from "next/server";
import { connectDB, Organization } from "@/lib/db";
import { getSession } from "@/lib/auth/server";

/** POST /api/onboarding — persist onboarding progress on the org. */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    await connectDB();
    await Organization.findByIdAndUpdate(session.orgId, {
      $set: { onboardingStep: body.step ?? "complete", ...(body.marketCode ? { marketCode: body.marketCode } : {}) },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Onboarding POST]", error);
    return NextResponse.json({ error: "Failed to save onboarding" }, { status: 500 });
  }
}

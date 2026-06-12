import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";
import { connectDB, Organization, MarketTemplate } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const org = await Organization.findById(session.orgId).select("-passwordHash -refreshToken");
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    // Attach market template defaults
    const marketTemplate = await MarketTemplate.findOne({ marketCode: org.marketCode });

    return NextResponse.json({
      success: true,
      user: {
        id: org._id.toString(),
        email: org.email,
        name: org.fullName || org.name,
        role: org.role,
        orgId: org._id.toString(),
        plan: org.plan,
        marketCode: org.marketCode,
        currency: org.settings?.overrides?.currency || org.currency,
        timezone: org.settings?.overrides?.timezone || org.timezone,
        marketTemplate: marketTemplate
          ? {
              displayName: marketTemplate.displayName,
              flag: marketTemplate.flag,
              weekendDefinition: marketTemplate.weekendDefinition,
              guardrailDefaults: marketTemplate.guardrailDefaults,
            }
          : null,
      },
    });
  } catch (e) {
    console.error("[Auth/Me]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

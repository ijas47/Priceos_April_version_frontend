import { NextRequest, NextResponse } from "next/server";
import { connectDB, Organization, MarketTemplate } from "@/lib/db";
import { requireSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireSession();
    await connectDB();

    const org = await Organization.findById(session.orgId).select("-passwordHash -refreshToken");
    if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const template = await MarketTemplate.findOne({ marketCode: org.marketCode }).lean();

    return NextResponse.json({
      success: true,
      org: {
        id: org._id.toString(),
        name: org.name,
        email: org.email,
        fullName: org.fullName,
        plan: org.plan,
        marketCode: org.marketCode,
        currency: org.settings?.overrides?.currency || org.currency,
        timezone: org.settings?.overrides?.timezone || org.timezone,
        settings: org.settings,
        marketTemplate: template,
      },
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[Org GET]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireSession();
    await connectDB();

    const body = await req.json();
    const allowed = ["name", "fullName", "marketCode", "currency", "timezone", "settings", "hostawayApiKey", "hostawayAccountId"];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    // If marketCode changed and no currency override, pull from template
    if (body.marketCode && !body.settings?.overrides?.currency) {
      const template = await MarketTemplate.findOne({ marketCode: body.marketCode });
      if (template) {
        updates.currency = template.currency;
        updates.timezone = template.timezone;
      }
    }

    const org = await Organization.findByIdAndUpdate(
      session.orgId,
      { $set: updates },
      { new: true }
    ).select("-passwordHash -refreshToken");

    return NextResponse.json({ success: true, org });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[Org PUT]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

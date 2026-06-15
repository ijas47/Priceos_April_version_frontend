import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";
import { connectDB, Organization } from "@/lib/db";
import { getOrgPricingPack, UAE_PRICELABS_DEFAULTS } from "@/lib/pricing";
import { applyPricingPackToOrg } from "@/lib/pricing/apply-defaults";

export const dynamic = "force-dynamic";

/** GET portfolio pricing pack (profiles, calendars, defaults). */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const org = await Organization.findById(session.orgId)
      .select("pricingPack pricingPackVersion marketCode eventPricingWeight")
      .lean();

    const pack = getOrgPricingPack(org ?? {});
    return NextResponse.json({
      pack,
      version: org?.pricingPackVersion ?? null,
      marketCode: org?.marketCode ?? "UAE_DXB",
      eventPricingWeight: org?.eventPricingWeight ?? "low",
      isDefault: !org?.pricingPack,
    });
  } catch (error) {
    console.error("[pricing/profiles GET]", error);
    return NextResponse.json({ error: "Failed to load profiles" }, { status: 500 });
  }
}

/** PATCH save portfolio pricing pack (profiles, minstay, calendars). */
export async function PATCH(req: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { pack } = body;
    if (!pack?.pricingProfiles || !pack?.minStayProfiles) {
      return NextResponse.json({ error: "Invalid pricing pack" }, { status: 400 });
    }

    await connectDB();
    await Organization.findByIdAndUpdate(session.orgId, {
      $set: {
        pricingPack: pack,
        pricingPackVersion: pack.version ?? `custom-${Date.now()}`,
      },
    });

    return NextResponse.json({ success: true, version: pack.version });
  } catch (error) {
    console.error("[pricing/profiles PATCH]", error);
    return NextResponse.json({ error: "Failed to save profiles" }, { status: 500 });
  }
}

/** POST apply UAE PriceLabs defaults to this org (portfolio baseline). */
export async function POST() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const result = await applyPricingPackToOrg(session.orgId, UAE_PRICELABS_DEFAULTS);
    return NextResponse.json({ success: true, ...result, version: UAE_PRICELABS_DEFAULTS.version });
  } catch (error) {
    console.error("[pricing/profiles POST]", error);
    return NextResponse.json({ error: "Failed to apply defaults" }, { status: 500 });
  }
}
import { connectDB, Listing } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

const CONFIG_FIELDS = [
  "priceFloor", "priceCeiling",
  "lastMinuteEnabled", "lastMinuteDaysOut", "lastMinuteDiscountPct", "lastMinuteMinStay",
  "lastMinuteRampEnabled", "lastMinuteRampDays", "lastMinuteMaxDiscountPct", "lastMinuteMinDiscountPct",
  "farOutEnabled", "farOutDaysOut", "farOutMarkupPct", "farOutMinStay",
  "dowPricingEnabled", "dowDays", "dowPriceAdjPct", "dowMinStay",
  "gapPreventionEnabled", "minFragmentThreshold",
  "gapFillEnabled", "gapFillLengthMin", "gapFillLengthMax", "gapFillDiscountPct", "gapFillOverrideCico",
  "allowedCheckinDays", "allowedCheckoutDays",
  "lowestMinStayAllowed", "defaultMaxStay",
  "occupancyEnabled", "occupancyLookbackDays", "occupancyMatrix", "occupancyPreset",
  "usePortfolioPricingDefaults", "pricingProfileOverrideId", "seasonalCalendarOverrideId",
  "minStayProfileOverrideId",
] as const;

function pickConfig(l: Record<string, unknown>) {
  const config: Record<string, unknown> = {};
  for (const key of CONFIG_FIELDS) {
    if (l[key] !== undefined) config[key] = l[key];
  }
  return config;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid listing ID" }, { status: 400 });
    }
    await connectDB();

    const l = await Listing.findOne({
      _id: new mongoose.Types.ObjectId(id),
      orgId: session.orgId,
    }).lean();
    if (!l) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    return NextResponse.json(pickConfig(l as unknown as Record<string, unknown>));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load config";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid listing ID" }, { status: 400 });
    }
    await connectDB();

    const body = await req.json();
    const updateFields: Record<string, unknown> = {};
    for (const key of CONFIG_FIELDS) {
      if (body[key] !== undefined) updateFields[key] = body[key];
    }

    const result = await Listing.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(id), orgId: session.orgId },
      { $set: updateFields }
    );
    if (!result) {
      return NextResponse.json(
        { error: "Listing not found or access denied" },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update config";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
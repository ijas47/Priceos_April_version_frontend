import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { getSession } from "@/lib/auth/server";
import { connectDB, PropertyGroup, GroupPricingRule } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; ruleId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, ruleId } = await params;
    const body = await req.json();
    await connectDB();
    const orgId = new mongoose.Types.ObjectId(session.orgId);
    const groupOid = new mongoose.Types.ObjectId(id);
    const ruleOid = new mongoose.Types.ObjectId(ruleId);

    const group = await PropertyGroup.findOne({ _id: groupOid, orgId }).lean();
    if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

    const allowed = [
      "ruleType", "ruleCategory", "name", "enabled", "priority",
      "startDate", "endDate", "daysOfWeek", "minNights",
      "priceOverride", "priceAdjPct", "minPriceOverride", "maxPriceOverride",
      "minStayOverride", "isBlocked", "closedToArrival", "closedToDeparture",
      "suspendLastMinute", "suspendGapFill",
    ];
    const update: Record<string, unknown> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) update[key] = body[key];
    }

    const rule = await GroupPricingRule.findOneAndUpdate(
      { _id: ruleOid, groupId: groupOid, orgId },
      { $set: update },
      { new: true }
    ).lean();

    if (!rule) return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    return NextResponse.json({ ...rule, _id: rule._id.toString() });
  } catch (error) {
    console.error("[groups/rules PATCH]", error);
    return NextResponse.json({ error: "Failed to update rule" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; ruleId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, ruleId } = await params;
    await connectDB();
    const orgId = new mongoose.Types.ObjectId(session.orgId);

    const result = await GroupPricingRule.deleteOne({
      _id: new mongoose.Types.ObjectId(ruleId),
      groupId: new mongoose.Types.ObjectId(id),
      orgId,
    });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[groups/rules DELETE]", error);
    return NextResponse.json({ error: "Failed to delete rule" }, { status: 500 });
  }
}
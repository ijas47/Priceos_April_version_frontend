import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { getSession } from "@/lib/auth/server";
import { connectDB, PropertyGroup, GroupPricingRule } from "@/lib/db";

export const dynamic = "force-dynamic";

async function assertGroup(groupId: string, orgId: mongoose.Types.ObjectId) {
  if (!mongoose.Types.ObjectId.isValid(groupId)) return null;
  return PropertyGroup.findOne({
    _id: new mongoose.Types.ObjectId(groupId),
    orgId,
  }).lean();
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    await connectDB();
    const orgId = new mongoose.Types.ObjectId(session.orgId);
    const group = await assertGroup(id, orgId);
    if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

    const rules = await GroupPricingRule.find({
      groupId: group._id,
      orgId,
    })
      .sort({ priority: 1 })
      .lean();

    return NextResponse.json(
      rules.map((r) => ({ ...r, _id: r._id.toString() }))
    );
  } catch (error) {
    console.error("[groups/rules GET]", error);
    return NextResponse.json({ error: "Failed to load rules" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    await connectDB();
    const orgId = new mongoose.Types.ObjectId(session.orgId);
    const group = await assertGroup(id, orgId);
    if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

    const rule = await GroupPricingRule.create({
      orgId,
      groupId: group._id,
      ruleType: body.ruleType,
      ruleCategory: body.ruleCategory,
      name: body.name,
      enabled: body.enabled ?? true,
      priority: body.priority ?? 50,
      startDate: body.startDate,
      endDate: body.endDate,
      daysOfWeek: body.daysOfWeek,
      minNights: body.minNights,
      priceOverride: body.priceOverride,
      priceAdjPct: body.priceAdjPct,
      minPriceOverride: body.minPriceOverride,
      maxPriceOverride: body.maxPriceOverride,
      minStayOverride: body.minStayOverride,
      isBlocked: body.isBlocked ?? false,
      closedToArrival: body.closedToArrival ?? false,
      closedToDeparture: body.closedToDeparture ?? false,
      suspendLastMinute: body.suspendLastMinute ?? false,
      suspendGapFill: body.suspendGapFill ?? false,
    });

    return NextResponse.json({ ...rule.toObject(), _id: rule._id.toString() });
  } catch (error) {
    console.error("[groups/rules POST]", error);
    return NextResponse.json({ error: "Failed to create rule" }, { status: 500 });
  }
}
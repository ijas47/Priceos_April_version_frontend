import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { getSession } from "@/lib/auth/server";
import { connectDB, PropertyGroup } from "@/lib/db";

export const dynamic = "force-dynamic";

async function loadGroup(id: string, orgId: mongoose.Types.ObjectId) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return PropertyGroup.findOne({ _id: new mongoose.Types.ObjectId(id), orgId }).lean();
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
    const group = await loadGroup(id, orgId);
    if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

    return NextResponse.json({
      ...group,
      _id: group._id.toString(),
      listingIds: (group.listingIds ?? []).map((lid) => lid.toString()),
    });
  } catch (error) {
    console.error("[groups/id GET]", error);
    return NextResponse.json({ error: "Failed to load group" }, { status: 500 });
  }
}

/** Alias for clients that still send PUT */
export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  return PATCH(req, ctx);
}

export async function PATCH(
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

    const update: Record<string, unknown> = {};
    const unset: Record<string, 1> = {};
    if (body.name !== undefined) update.name = String(body.name).trim();
    if (body.description !== undefined) update.description = body.description;
    if (body.color !== undefined) update.color = body.color;
    if (body.listingIds !== undefined) {
      update.listingIds = (body.listingIds as string[])
        .filter((lid) => mongoose.Types.ObjectId.isValid(lid))
        .map((lid) => new mongoose.Types.ObjectId(lid));
    }
    const optionalStringFields = [
      "pricingProfileOverrideId",
      "seasonalCalendarOverrideId",
      "minStayProfileOverrideId",
    ] as const;
    for (const key of optionalStringFields) {
      if (body[key] !== undefined) {
        if (body[key]) update[key] = body[key];
        else unset[key] = 1;
      }
    }

    const group = await PropertyGroup.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(id), orgId },
      {
        ...(Object.keys(update).length ? { $set: update } : {}),
        ...(Object.keys(unset).length ? { $unset: unset } : {}),
      },
      { new: true }
    ).lean();

    if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

    return NextResponse.json({
      ...group,
      _id: group._id.toString(),
      listingIds: (group.listingIds ?? []).map((lid) => lid.toString()),
    });
  } catch (error) {
    console.error("[groups/id PATCH]", error);
    return NextResponse.json({ error: "Failed to update group" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    await connectDB();
    const orgId = new mongoose.Types.ObjectId(session.orgId);

    const result = await PropertyGroup.deleteOne({
      _id: new mongoose.Types.ObjectId(id),
      orgId,
    });
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const { GroupPricingRule } = await import("@/lib/db");
    await GroupPricingRule.deleteMany({ groupId: new mongoose.Types.ObjectId(id), orgId });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[groups/id DELETE]", error);
    return NextResponse.json({ error: "Failed to delete group" }, { status: 500 });
  }
}
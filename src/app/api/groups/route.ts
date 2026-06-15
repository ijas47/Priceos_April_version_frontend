import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { getSession } from "@/lib/auth/server";
import { connectDB, PropertyGroup } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const orgId = new mongoose.Types.ObjectId(session.orgId);
    const groups = await PropertyGroup.find({ orgId }).sort({ updatedAt: -1 }).lean();

    return NextResponse.json(
      groups.map((g) => ({
        ...g,
        _id: g._id.toString(),
        listingIds: (g.listingIds ?? []).map((id) => id.toString()),
      }))
    );
  } catch (error) {
    console.error("[groups GET]", error);
    return NextResponse.json({ error: "Failed to load groups" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { name, description, color, listingIds } = body;
    if (!name?.trim()) {
      return NextResponse.json({ error: "Group name is required" }, { status: 400 });
    }

    await connectDB();
    const orgId = new mongoose.Types.ObjectId(session.orgId);
    const ids = (listingIds ?? [])
      .filter((id: string) => mongoose.Types.ObjectId.isValid(id))
      .map((id: string) => new mongoose.Types.ObjectId(id));

    const group = await PropertyGroup.create({
      orgId,
      name: name.trim(),
      description: description?.trim(),
      color: color || "#6366f1",
      listingIds: ids,
    });

    return NextResponse.json({
      ...group.toObject(),
      _id: group._id.toString(),
      listingIds: group.listingIds.map((id) => id.toString()),
    });
  } catch (error) {
    console.error("[groups POST]", error);
    return NextResponse.json({ error: "Failed to create group" }, { status: 500 });
  }
}
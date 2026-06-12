import { connectDB, Organization } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

export async function GET() {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const org = await Organization.findById(
        new mongoose.Types.ObjectId(session.orgId)
    ).select("-passwordHash -refreshToken").lean();

    if (!org) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
        id: org._id.toString(),
        userId: org._id.toString(),
        fullName: org.fullName || "",
        email: org.email,
        role: org.role,
        isApproved: org.isApproved,
        hostawayApiKey: org.hostawayApiKey || "",
        preferences: org.settings || {},
    });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const body = await req.json();
    const { fullName, email, hostawayApiKey } = body;

    const updateData: Record<string, unknown> = {};
    if (fullName !== undefined) updateData.fullName = fullName;
    if (email !== undefined) updateData.email = email;
    if (hostawayApiKey !== undefined) updateData.hostawayApiKey = hostawayApiKey;

    const updated = await Organization.findByIdAndUpdate(
        new mongoose.Types.ObjectId(session.orgId),
        { $set: updateData },
        { new: true }
    ).select("-passwordHash -refreshToken").lean();

    if (!updated) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
        id: updated._id.toString(),
        userId: updated._id.toString(),
        fullName: updated.fullName || "",
        email: updated.email,
        role: updated.role,
        isApproved: updated.isApproved,
        hostawayApiKey: updated.hostawayApiKey || "",
        preferences: updated.settings || {},
    });
}

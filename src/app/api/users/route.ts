import { connectDB, Organization } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

export async function GET() {
    try {
        await connectDB();
        const orgs = await Organization.find({})
            .select("-passwordHash -refreshToken")
            .lean();

        const users = orgs.map(o => ({
            id: o._id.toString(),
            userId: o._id.toString(),
            fullName: o.fullName || "",
            email: o.email,
            isApproved: o.isApproved,
            role: o.role,
        }));

        return NextResponse.json(users);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { fullName, email, role, password } = body;

        if (!email) {
            return NextResponse.json({ error: "Missing email" }, { status: 400 });
        }

        await connectDB();

        const existing = await Organization.findOne({ email: email.trim().toLowerCase() });
        if (existing) {
            return NextResponse.json({ error: "User already exists with this email" }, { status: 400 });
        }

        const passwordHash = await bcrypt.hash(password || "changeme123", 10);
        const org = await Organization.create({
            name: fullName || email,
            email: email.trim().toLowerCase(),
            passwordHash,
            fullName,
            role: role || "viewer",
            isApproved: true,
        });

        return NextResponse.json({
            success: true,
            user: {
                id: org._id.toString(),
                userId: org._id.toString(),
                fullName: org.fullName || "",
                email: org.email,
                isApproved: org.isApproved,
                role: org.role,
            },
        });
    } catch (e: any) {
        console.error("User creation error:", e);
        return NextResponse.json({ error: e.message || "Something went wrong" }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const url = new URL(req.url);
        const userId = url.searchParams.get("userId");
        if (!userId) return NextResponse.json({ error: "No userId" }, { status: 400 });

        await connectDB();
        await Organization.findByIdAndDelete(new mongoose.Types.ObjectId(userId));
        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { userId, role, fullName, email, isApproved } = body;

        if (!userId) {
            return NextResponse.json({ error: "Missing userId" }, { status: 400 });
        }

        await connectDB();

        const updateData: Record<string, unknown> = {};
        if (role !== undefined) updateData.role = role;
        if (fullName !== undefined) updateData.fullName = fullName;
        if (email !== undefined) updateData.email = email;
        if (isApproved !== undefined) updateData.isApproved = isApproved;

        const updated = await Organization.findByIdAndUpdate(
            new mongoose.Types.ObjectId(userId),
            { $set: updateData },
            { new: true }
        ).select("-passwordHash -refreshToken").lean();

        if (!updated) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true, user: { ...updated, id: updated._id.toString() } });
    } catch (e: any) {
        console.error("User update error:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

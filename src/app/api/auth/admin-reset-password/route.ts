import { NextRequest, NextResponse } from "next/server";
import { connectDB, Organization } from "@/lib/db";
import bcrypt from "bcryptjs";

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/admin-reset-password
 * Directly resets a user's password by email (admin only, no token needed)
 */
export async function POST(req: NextRequest) {
    try {
        const { email, newPassword } = await req.json();

        if (!email || !newPassword) {
            return NextResponse.json({ error: "Email and new password are required" }, { status: 400 });
        }

        await connectDB();

        const org = await Organization.findOne({ email: email.trim().toLowerCase() });
        if (!org) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const passwordHash = await bcrypt.hash(newPassword, 10);
        await Organization.findByIdAndUpdate(org._id, { $set: { passwordHash } });

        return NextResponse.json({ success: true, message: "Password updated successfully" });
    } catch (error: any) {
        console.error("[admin-reset-password] Error:", error);
        return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
    }
}

/**
 * GET /api/auth/admin-reset-password?email=xxx
 * Check if a user with the given email exists
 */
export async function GET(req: NextRequest) {
    const email = req.nextUrl.searchParams.get("email");
    if (!email) return NextResponse.json({ exists: false }, { status: 400 });

    try {
        await connectDB();
        const org = await Organization.findOne({ email: email.trim().toLowerCase() })
            .select("fullName name")
            .lean();
        return NextResponse.json({ exists: !!org, name: org?.fullName || org?.name || null });
    } catch {
        return NextResponse.json({ exists: false }, { status: 500 });
    }
}

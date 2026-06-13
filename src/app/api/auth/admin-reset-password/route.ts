import { NextRequest, NextResponse } from "next/server";
import { connectDB, Organization } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import bcrypt from "bcryptjs";

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/admin-reset-password
 * Resets a user's password. Requires admin authentication.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (session.role !== "owner" && session.role !== "admin") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { email, newPassword } = await req.json();

        if (!email || !newPassword) {
            return NextResponse.json({ error: "Email and new password are required" }, { status: 400 });
        }
        if (newPassword.length < 8) {
            return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
        }

        await connectDB();

        const org = await Organization.findOne({ email: email.trim().toLowerCase() });
        if (!org) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const passwordHash = await bcrypt.hash(newPassword, 12);
        await Organization.findByIdAndUpdate(org._id, { $set: { passwordHash } });

        return NextResponse.json({ success: true, message: "Password updated successfully" });
    } catch (error: any) {
        console.error("[admin-reset-password]", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

/**
 * GET /api/auth/admin-reset-password?email=xxx
 * Check if a user exists. Requires authentication.
 */
export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

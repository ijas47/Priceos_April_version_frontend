import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { connectDB, Organization } from "@/lib/db";
import { getSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/** GET /api/admin/users - list all accounts (owner/admin only). */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.role !== "owner" && session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await connectDB();
    const docs = await Organization.find({})
      .select("-passwordHash -refreshToken")
      .sort({ createdAt: -1 })
      .lean();

    const users = docs.map((o) => ({
      id: o._id.toString(),
      name: o.fullName || o.name || "",
      email: o.email,
      role: o.role || "viewer",
      isApproved: o.isApproved !== false,
      marketCode: o.marketCode || "UAE_DXB",
      currency: o.currency || "AED",
      plan: o.plan || "starter",
      onboardingStep: (o as unknown as Record<string, unknown>).onboardingStep || "complete",
      createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : new Date().toISOString(),
    }));

    return NextResponse.json({ users });
  } catch (error) {
    console.error("[Admin users GET]", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

/** POST /api/admin/users - create a user with a temporary password. */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.role !== "owner" && session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { fullName, email, role, marketCode } = body;
    if (!fullName || !email) {
      return NextResponse.json({ error: "fullName and email are required" }, { status: 400 });
    }

    await connectDB();
    const existing = await Organization.findOne({ email: email.toLowerCase() });
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    const temporaryPassword = crypto.randomBytes(6).toString("base64url");
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    const org = await Organization.create({
      name: fullName,
      fullName,
      email: email.toLowerCase(),
      passwordHash,
      role: role || "viewer",
      isApproved: true,
      marketCode: marketCode || "UAE_DXB",
      currency: "AED",
      timezone: "Asia/Dubai",
      plan: "starter",
    });

    return NextResponse.json(
      { user: { id: org._id.toString(), email: org.email, temporaryPassword } },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Admin users POST]", error);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}

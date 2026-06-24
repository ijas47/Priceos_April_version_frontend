import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB, Organization } from "@/lib/db";
import { getSession, COOKIE_NAME } from "@/lib/auth/server";
import { signAccessToken } from "@/lib/auth/jwt";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/api/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/change-password
 * Authenticated user sets a new password (required on first login for admin-created accounts).
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rateCheck = checkRateLimit(`auth-change-pwd:${ip}`, RATE_LIMITS.auth);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${Math.ceil(rateCheck.resetMs / 1000)}s.` },
      { status: 429 }
    );
  }

  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { currentPassword, newPassword } = await req.json();
    if (!newPassword || String(newPassword).length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters" },
        { status: 400 }
      );
    }

    await connectDB();
    const org = await Organization.findById(session.orgId);
    if (!org) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    if (!org.mustChangePassword) {
      if (!currentPassword) {
        return NextResponse.json({ error: "Current password is required" }, { status: 400 });
      }
      const valid = await bcrypt.compare(currentPassword, org.passwordHash);
      if (!valid) {
        return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
      }
    }

    org.passwordHash = await bcrypt.hash(String(newPassword), 12);
    org.mustChangePassword = false;
    await org.save();

    const token = signAccessToken({
      userId: org._id.toString(),
      orgId: org._id.toString(),
      email: org.email,
      role: org.role,
      isApproved: org.isApproved !== false,
      onboardingStep: org.onboardingStep || "complete",
      mustChangePassword: false,
    });

    const response = NextResponse.json({ success: true });
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return response;
  } catch (e) {
    console.error("[Auth/ChangePassword]", e);
    return NextResponse.json({ error: "Failed to update password" }, { status: 500 });
  }
}
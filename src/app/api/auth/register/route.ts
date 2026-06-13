import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB, Organization, MarketTemplate } from "@/lib/db";
import { signAccessToken } from "@/lib/auth/jwt";
import { COOKIE_NAME } from "@/lib/auth/server";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/api/rate-limit";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req as any);
  const rateCheck = checkRateLimit(`auth-register:${ip}`, RATE_LIMITS.auth);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: `Too many registration attempts. Try again in ${Math.ceil(rateCheck.resetMs / 1000)}s.` },
      { status: 429 },
    );
  }

  try {
    const { name, email, password, orgName, marketCode } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: "name, email and password are required" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    await connectDB();

    const existing = await Organization.findOne({ email: email.toLowerCase() });
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    // Resolve market template for defaults
    const mktCode = marketCode || "UAE_DXB";
    const template = await MarketTemplate.findOne({ marketCode: mktCode });

    const passwordHash = await bcrypt.hash(password, 12);

    const org = await Organization.create({
      name: orgName || name,
      email: email.toLowerCase(),
      passwordHash,
      fullName: name,
      role: "owner",
      isApproved: true,
      marketCode: mktCode,
      currency: template?.currency || "AED",
      timezone: template?.timezone || "Asia/Dubai",
      plan: "starter",
      settings: {
        guardrails: {
          maxSingleDayChangePct: template?.guardrailDefaults?.maxSingleDayChangePct ?? 15,
          autoApproveThreshold: template?.guardrailDefaults?.autoApproveThreshold ?? 5,
          absoluteFloorMultiplier: template?.guardrailDefaults?.absoluteFloorMultiplier ?? 0.5,
          absoluteCeilingMultiplier: template?.guardrailDefaults?.absoluteCeilingMultiplier ?? 3.0,
        },
        automation: { autoPushApproved: false, dailyPipelineRun: true },
        overrides: {},
      },
    });

    const accessToken = signAccessToken({
      userId: org._id.toString(),
      orgId: org._id.toString(),
      email: org.email,
      role: org.role,
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: org._id.toString(),
        email: org.email,
        name: org.fullName || org.name,
        role: org.role,
        orgId: org._id.toString(),
      },
    }, { status: 201 });

    response.cookies.set(COOKIE_NAME, accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return response;
  } catch (e: unknown) {
    console.error("[Auth/Register]", e);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}

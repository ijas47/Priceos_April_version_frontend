import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB, User } from "@/lib/db";
import { signAccessToken, signRefreshToken } from "@/lib/auth/jwt";
import { COOKIE_NAME } from "@/lib/auth/server";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/api/rate-limit";
import { apiError } from "@/lib/api/response";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rateCheck = checkRateLimit(`auth-login:${ip}`, RATE_LIMITS.auth);
  if (!rateCheck.allowed) {
    return apiError("RATE_LIMITED", `Too many attempts. Try again in ${Math.ceil(rateCheck.resetMs / 1000)}s.`, 429);
  }

  try {
    const { username, password, email } = await req.json();
    const loginEmail = (email || username || "").trim().toLowerCase();

    if (!loginEmail || !password) {
      return apiError("VALIDATION_ERROR", "Email and password are required", 400);
    }

    await connectDB();
    console.log("[Auth/Login] Looking up email:", loginEmail);
    const user = await User.findOne({ email: loginEmail });
    console.log("[Auth/Login] User found:", !!user, user ? `id=${user._id} approved=${user.isApproved}` : "");

    if (!user) {
      console.log("[Auth/Login] ❌ No user found for:", loginEmail);
      return apiError("UNAUTHORIZED", "Invalid credentials", 401);
    }

    if (!user.isApproved) {
      console.log("[Auth/Login] ❌ User not approved:", loginEmail);
      return apiError("FORBIDDEN", "Account pending approval", 403);
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    console.log("[Auth/Login] Password valid:", isValid);
    if (!isValid) {
      console.log("[Auth/Login] ❌ Wrong password for:", loginEmail);
      return apiError("UNAUTHORIZED", "Invalid credentials", 401);
    }

    const payload = {
      userId: user._id.toString(),
      orgId:  user._id.toString(),
      email:  user.email,
      role:   user.role,
    };

    const accessToken  = signAccessToken(payload);
    const refreshToken = signRefreshToken(user._id.toString());

    // Save refresh token
    user.refreshToken = refreshToken;
    await user.save();

    const response = NextResponse.json({
      success: true,
      user: {
        id:    user._id.toString(),
        email: user.email,
        name:  user.fullName || user.name,
        role:  user.role,
        orgId: user._id.toString(),
        plan:  user.plan,
      },
    });

    response.cookies.set(COOKIE_NAME, accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return response;
  } catch (e: unknown) {
    console.error("[Auth/Login] Error:", e);
    return apiError("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getSession, COOKIE_NAME } from "@/lib/auth/server";
import { signAccessToken } from "@/lib/auth/jwt";
import { healOnboardingStepIfNeeded } from "@/lib/auth/onboarding-step";

/** GET /api/onboarding/heal — refresh JWT after legacy/demo onboarding skip. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  const origin = req.nextUrl.origin;

  if (!session) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  const step = await healOnboardingStepIfNeeded(session.orgId);
  if (step !== "complete") {
    return NextResponse.redirect(new URL("/onboarding", origin));
  }

  const token = signAccessToken({
    userId: session.userId,
    orgId: session.orgId,
    email: session.email,
    role: session.role,
    isApproved: true,
    onboardingStep: "complete",
    mustChangePassword: session.mustChangePassword,
  });

  const response = NextResponse.redirect(new URL("/dashboard", origin));
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  return response;
}
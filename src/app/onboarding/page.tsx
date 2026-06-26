import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAccessToken, signAccessToken } from "@/lib/auth/jwt";
import { connectDB, Organization } from "@/lib/db";
import {
  resolveEffectiveOnboardingStep,
  healOnboardingStepIfNeeded,
} from "@/lib/auth/onboarding-step";
import { COOKIE_NAME } from "@/lib/auth/server";
import { OnboardingWizard } from "@/components/onboarding/wizard";

/**
 * /onboarding — resume wizard or redirect legacy/demo accounts to dashboard.
 */
export default async function OnboardingPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("priceos-session")?.value;

  if (!token) {
    redirect("/login");
  }

  let payload;
  try {
    payload = verifyAccessToken(token!);
  } catch {
    redirect("/login");
  }

  if (!payload.isApproved) {
    redirect("/pending-approval");
  }

  await connectDB();
  const org = await Organization.findById(payload.orgId).lean();
  if (!org) {
    redirect("/login");
  }

  const step = await resolveEffectiveOnboardingStep(org);
  if (step === "complete") {
    await healOnboardingStepIfNeeded(org._id.toString());
    const refreshed = signAccessToken({
      userId: payload.userId,
      orgId: payload.orgId,
      email: payload.email,
      role: payload.role,
      isApproved: true,
      onboardingStep: "complete",
      mustChangePassword: payload.mustChangePassword,
    });
    cookieStore.set(COOKIE_NAME, refreshed, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
    redirect("/dashboard");
  }

  return <OnboardingWizard initialStep={step} />;
}
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { connectDB, Organization } from "@/lib/db";
import { resolveEffectiveOnboardingStep } from "@/lib/auth/onboarding-step";
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
    redirect("/api/onboarding/heal");
  }

  return <OnboardingWizard initialStep={step} />;
}
import mongoose from "mongoose";
import { connectDB, Organization, Listing } from "@/lib/db";

export type OnboardingStepId = "connect" | "select" | "market" | "strategy" | "complete";

interface OrgOnboardingFields {
  _id: mongoose.Types.ObjectId | string;
  onboardingStep?: string | null;
  hostawayAccountId?: string | null;
  hostawayApiKey?: string | null;
  pricingPackVersion?: string | null;
}

/**
 * Resolve whether an org should see the onboarding wizard.
 * Legacy demo accounts with listings / Hostaway / pricing pack → complete.
 */
export async function resolveEffectiveOnboardingStep(
  org: OrgOnboardingFields
): Promise<OnboardingStepId> {
  const stored = org.onboardingStep as OnboardingStepId | undefined;
  if (stored === "complete") return "complete";

  await connectDB();
  const orgOid =
    typeof org._id === "string" ? new mongoose.Types.ObjectId(org._id) : org._id;

  const listingCount = await Listing.countDocuments({
    orgId: orgOid,
    isActive: { $ne: false },
  });

  // Demo / migrated portfolios — already set up before pilot onboarding gate
  if (listingCount > 0) return "complete";

  const hasHostaway = !!(org.hostawayAccountId?.trim() && org.hostawayApiKey?.trim());
  if (hasHostaway && org.pricingPackVersion) return "complete";

  const inProgress = new Set<OnboardingStepId>(["connect", "select", "market", "strategy"]);
  if (stored && inProgress.has(stored as OnboardingStepId)) {
    return stored as OnboardingStepId;
  }

  return "connect";
}

/** Persist complete when legacy account is detected; returns effective step for JWT. */
export async function healOnboardingStepIfNeeded(orgId: string): Promise<OnboardingStepId> {
  await connectDB();
  const org = await Organization.findById(orgId);
  if (!org) return "connect";

  const effective = await resolveEffectiveOnboardingStep(org);
  if (effective === "complete" && org.onboardingStep !== "complete") {
    org.onboardingStep = "complete";
    await org.save();
  }
  return effective;
}
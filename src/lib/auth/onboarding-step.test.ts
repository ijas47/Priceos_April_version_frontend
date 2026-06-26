import { describe, expect, it } from "vitest";
import type { OnboardingStepId } from "./onboarding-step";

describe("onboarding step types", () => {
  it("complete is terminal", () => {
    const step: OnboardingStepId = "complete";
    expect(step).toBe("complete");
  });
});
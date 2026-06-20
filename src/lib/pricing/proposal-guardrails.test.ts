import { describe, expect, it } from "vitest";
import { applyProposalGuardrails, computeChangePct } from "./proposal-guardrails";

describe("applyProposalGuardrails", () => {
  it("caps upward move to maxSingleDayChangePct", () => {
    const result = applyProposalGuardrails({
      proposedPrice: 200,
      currentPrice: 100,
      guardrails: { maxSingleDayChangePct: 15, autoApproveThreshold: 5 },
    });
    expect(result.proposedPrice).toBe(115);
    expect(result.guardrailNotes.some((n) => n.includes("Capped"))).toBe(true);
  });

  it("auto-approves when change is within threshold", () => {
    const result = applyProposalGuardrails({
      proposedPrice: 103,
      currentPrice: 100,
      guardrails: { maxSingleDayChangePct: 15, autoApproveThreshold: 5 },
    });
    expect(result.proposalStatus).toBe("approved");
    expect(result.changePct).toBe(3);
  });

  it("keeps pending when change exceeds auto-approve threshold", () => {
    const result = applyProposalGuardrails({
      proposedPrice: 108,
      currentPrice: 100,
      guardrails: { maxSingleDayChangePct: 15, autoApproveThreshold: 5 },
    });
    expect(result.proposalStatus).toBe("pending");
  });
});

describe("computeChangePct", () => {
  it("returns 0 when current is 0", () => {
    expect(computeChangePct(100, 0)).toBe(0);
  });
});
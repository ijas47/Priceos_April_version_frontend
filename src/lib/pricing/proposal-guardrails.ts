export interface OrgGuardrails {
  maxSingleDayChangePct: number;
  autoApproveThreshold: number;
}

export const DEFAULT_ORG_GUARDRAILS: OrgGuardrails = {
  maxSingleDayChangePct: 15,
  autoApproveThreshold: 5,
};

export interface GuardrailedProposal {
  proposedPrice: number;
  changePct: number;
  proposalStatus: "pending" | "approved";
  guardrailNotes: string[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeChangePct(proposed: number, current: number): number {
  if (current <= 0) return 0;
  return Math.round(((proposed - current) / current) * 1000) / 10;
}

/**
 * Cap proposal movement vs current calendar price and auto-approve small deltas.
 */
export function applyProposalGuardrails(args: {
  proposedPrice: number;
  currentPrice: number;
  guardrails?: Partial<OrgGuardrails> | null;
  isBooked?: boolean;
}): GuardrailedProposal {
  const guardrails = { ...DEFAULT_ORG_GUARDRAILS, ...args.guardrails };
  const notes: string[] = [];
  let price = args.proposedPrice;
  const current = args.currentPrice > 0 ? args.currentPrice : price;

  if (args.isBooked) {
    return {
      proposedPrice: price,
      changePct: computeChangePct(price, current),
      proposalStatus: "pending",
      guardrailNotes: notes,
    };
  }

  const maxPct = Math.max(1, guardrails.maxSingleDayChangePct);
  const maxUp = current * (1 + maxPct / 100);
  const maxDown = current * (1 - maxPct / 100);

  if (price > maxUp) {
    price = round2(maxUp);
    notes.push(`[GUARDRAIL] Capped +${maxPct}% daily move (${round2(maxUp)})`);
  } else if (price < maxDown) {
    price = round2(maxDown);
    notes.push(`[GUARDRAIL] Capped -${maxPct}% daily move (${round2(maxDown)})`);
  }

  const changePct = computeChangePct(price, current);
  const autoThreshold = Math.max(0, guardrails.autoApproveThreshold);
  const proposalStatus =
    Math.abs(changePct) <= autoThreshold && Math.abs(changePct) >= 0.1
      ? "approved"
      : "pending";

  if (proposalStatus === "approved") {
    notes.push(`[GUARDRAIL] Auto-approved (|${changePct}%| ≤ ${autoThreshold}%)`);
  }

  return { proposedPrice: price, changePct, proposalStatus, guardrailNotes: notes };
}
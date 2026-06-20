export type EventImpact = "high" | "medium" | "low";
export type EventPricingWeight = "low" | "medium" | "high";

export interface EventPricingInput {
  name: string;
  impactLevel: EventImpact;
}

const UPLIFT_CAPS: Record<
  EventPricingWeight,
  Record<EventImpact, number>
> = {
  low: { high: 8, medium: 4, low: 2 },
  medium: { high: 15, medium: 8, low: 4 },
  high: { high: 30, medium: 15, low: 5 },
};

export function resolveEventUpliftPct(
  events: EventPricingInput[],
  weight: EventPricingWeight = "low"
): { upliftPct: number; reasoning: string | null } {
  if (events.length === 0) {
    return { upliftPct: 0, reasoning: null };
  }

  const caps = UPLIFT_CAPS[weight];
  const high = events.filter((e) => e.impactLevel === "high");
  const medium = events.filter((e) => e.impactLevel === "medium");
  const low = events.filter((e) => e.impactLevel === "low");

  if (high.length > 0) {
    return {
      upliftPct: caps.high,
      reasoning: `[EVENT] High-impact: ${high.map((e) => e.name).join(", ")} (+${caps.high}%)`,
    };
  }
  if (medium.length > 0) {
    return {
      upliftPct: caps.medium,
      reasoning: `[EVENT] Medium-impact: ${medium.map((e) => e.name).join(", ")} (+${caps.medium}%)`,
    };
  }
  return {
    upliftPct: caps.low,
    reasoning: `[EVENT] Low-impact: ${low.map((e) => e.name).join(", ")} (+${caps.low}%)`,
  };
}

export function applyEventUplift(
  price: number,
  events: EventPricingInput[],
  weight: EventPricingWeight = "low"
): { price: number; reasoning: string | null } {
  const { upliftPct, reasoning } = resolveEventUpliftPct(events, weight);
  if (upliftPct <= 0) return { price, reasoning: null };
  return {
    price: Math.round(price * (1 + upliftPct / 100) * 100) / 100,
    reasoning,
  };
}
export const ACTIVITY_STEPS = [
  {
    id: "routing",
    icon: "Zap",
    label: "Routing Request",
    description: "CRO Router analyzing your query",
  },
  {
    id: "analyzing",
    icon: "BarChart3",
    label: "Analyzing Data",
    description: "Property Analyst processing metrics",
  },
  {
    id: "validating",
    icon: "ShieldCheck",
    label: "Validating Pricing",
    description: "PriceGuard checking proposals",
  },
  {
    id: "generating",
    icon: "Check",
    label: "Generating Response",
    description: "Finalizing recommendations",
  },
] as const;

export type ActivityStep = (typeof ACTIVITY_STEPS)[number];

export const SUGGESTED_PROMPTS = [
  "Analyze my property's pricing performance vs. competitors",
  "What's the optimal nightly rate for the upcoming weekend?",
  "Show me the demand pacing for my neighborhood",
  "Review my current minimum stay rules",
];

export const MANAGER_AGENT_ID = "69998743f4d61186679a9515";

// Worker agents (used by UI panels and agent orchestration)
export const EVENT_AGENT_ID = "event-agent";
export const MARKET_AGENT_ID = "market-agent";
export const STRATEGY_AGENT_ID = "strategy-agent";

// Specialized agents
export const PRICEGUARD_AGENT_ID = "priceguard-agent";
export const ARIA_AGENT_ID = "aria-cro";
export const BOOKING_AGENT_ID = "booking-intelligence";
export const BENCHMARK_AGENT_ID = "benchmark-agent";
export const GUARDRAILS_AGENT_ID = "guardrails-agent";
export const CONVERSATION_AGENT_ID = "conversation-summary";
export const ANOMALY_AGENT_ID = "anomaly-detector";


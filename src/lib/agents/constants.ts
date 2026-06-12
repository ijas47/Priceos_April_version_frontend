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

// Live Lyzr agent IDs (from Lyzr Studio) — used by API routes
export const CRO_ROUTER_AGENT_ID = process.env.LYZR_CRO_ROUTER_AGENT_ID || "69998743f4d61186679a9515";
export const PROPERTY_ANALYST_ID = process.env.LYZR_PROPERTY_ANALYST_AGENT_ID || "699987c35dbb137e7b66052e";
export const BOOKING_INTELLIGENCE_ID = process.env.LYZR_BOOKING_INTELLIGENCE_AGENT_ID || "699988262654671e44099318";
export const MARKET_RESEARCH_ID = process.env.LYZR_MARKET_RESEARCH_AGENT_ID || "699991985dbb137e7b660594";
export const PRICE_GUARD_ID = process.env.LYZR_PRICE_GUARD_AGENT_ID || "6999933b83d9dff0252dd86f";
export const MARKETING_AGENT_ID = process.env.Marketing_Agent_ID || "699993adb8bd4d3aac102a81";

// Worker agents (used by UI panels and agent orchestration)
export const EVENT_AGENT_ID = "event-agent";
export const MARKET_AGENT_ID = "market-agent";
export const STRATEGY_AGENT_ID = "strategy-agent";

// Specialized agents
export const PRICEGUARD_AGENT_ID = "priceguard-agent";
export const ARIA_AGENT_ID = "aria-cro";
export const BOOKING_AGENT_ID = "booking-intelligence";
export const BENCHMARK_AGENT_ID = process.env.LYZR_Competitor_Benchmark_Agent_ID || "699e7b559ff614f6db8964cf";
export const GUARDRAILS_AGENT_ID = process.env.Lyzr_Guardrail_Agent_for_Floor_Ceiling_Values || "69a941c5ad0c99ac601ac935";
export const CONVERSATION_AGENT_ID = "conversation-summary";
export const ANOMALY_AGENT_ID = "anomaly-detector";


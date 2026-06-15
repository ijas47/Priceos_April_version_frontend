/**
 * Canonical Lyzr Studio model assignments per agent role.
 *
 * Model strings use Lyzr provider prefixes (e.g. gemini/, anthropic/, perplexity/).
 * Run `node scripts/sync-lyzr-agent-models.mjs` to push these to Lyzr Studio.
 */

export type AgentModelTier = "orchestrator" | "analyst" | "safety" | "internet" | "guest";

export interface LyzrModelSpec {
  /** Lyzr Studio agent _id */
  lyzrAgentId: string;
  /** Human-readable name */
  name: string;
  /** Role tier — drives model selection */
  tier: AgentModelTier;
  /** Lyzr model string (provider/model) */
  model: string;
  temperature: number;
  maxTokens?: number;
  /** Why this model was chosen */
  rationale: string;
}

/** Fast structured analysis — calendar, bookings, portfolio math */
export const GEMINI_FLASH = "gemini/gemini-3-flash-preview";
/** Ultra-fast read-only tasks — summaries, light extraction */
export const GEMINI_FLASH_LITE = "gemini/gemini-3.1-flash-lite";
/** Best reasoning for user-facing orchestration and complex synthesis */
export const CLAUDE_SONNET = "anthropic/claude-sonnet-4-6";
/** Deterministic guardrails and numeric validation */
export const GPT_41 = "gpt-4.1";
/** Internet-connected search for live events and competitor rates */
export const PERPLEXITY_SONAR = "perplexity/sonar";

/** Lyzr Studio provider credentials required when switching models */
export interface LyzrProviderBinding {
  provider_id: string;
  llm_credential_id: string;
  /** Model string as stored on the agent (may differ from catalog key) */
  model: string;
}

export const MODEL_PROVIDER_BINDINGS: Record<string, LyzrProviderBinding> = {
  [CLAUDE_SONNET]: {
    provider_id: "Anthropic",
    llm_credential_id: "lyzr_anthropic",
    model: "anthropic/claude-sonnet-4-6",
  },
  [GEMINI_FLASH]: {
    provider_id: "Google",
    llm_credential_id: "lyzr_google",
    model: "gemini/gemini-3-flash-preview",
  },
  [GEMINI_FLASH_LITE]: {
    provider_id: "Google",
    llm_credential_id: "lyzr_google",
    model: "gemini/gemini-3.1-flash-lite",
  },
  [GPT_41]: {
    provider_id: "OpenAI",
    llm_credential_id: "lyzr_openai",
    model: "gpt-4.1",
  },
  [PERPLEXITY_SONAR]: {
    provider_id: "Perplexity",
    llm_credential_id: "lyzr_perplexity",
    model: "perplexity/sonar",
  },
};

export function getProviderBinding(modelKey: string): LyzrProviderBinding | undefined {
  return MODEL_PROVIDER_BINDINGS[modelKey];
}

/**
 * Live Lyzr agent registry — env overrides supported for each agent ID.
 * Models tuned for demo week: accurate dates/events, fast workers, strict safety.
 */
export const LYZR_AGENT_MODELS: LyzrModelSpec[] = [
  {
    lyzrAgentId: process.env.LYZR_CRO_ROUTER_AGENT_ID || "69998743f4d61186679a9515",
    name: "CRO Router (Aria)",
    tier: "orchestrator",
    model: CLAUDE_SONNET,
    temperature: 0.2,
    maxTokens: 4000,
    rationale: "Best reasoning for multi-agent orchestration; low temp prevents date/event hallucinations",
  },
  {
    lyzrAgentId: process.env.LYZR_PROPERTY_ANALYST_AGENT_ID || "699987c35dbb137e7b66052e",
    name: "Property Analyst",
    tier: "analyst",
    model: GEMINI_FLASH,
    temperature: 0.1,
    maxTokens: 4000,
    rationale: "Fast structured calendar/gap analysis",
  },
  {
    lyzrAgentId: process.env.LYZR_BOOKING_INTELLIGENCE_AGENT_ID || "699988262654671e44099318",
    name: "Booking Intelligence",
    tier: "analyst",
    model: GEMINI_FLASH,
    temperature: 0.1,
    maxTokens: 3000,
    rationale: "Fast pattern extraction from reservation data",
  },
  {
    lyzrAgentId: process.env.LYZR_MARKET_RESEARCH_AGENT_ID || "699991985dbb137e7b660594",
    name: "Market Research",
    tier: "analyst",
    model: GEMINI_FLASH,
    temperature: 0.1,
    maxTokens: 3000,
    rationale: "Parse-only on verified SERP/News/DB intel — no live Sonar hallucinations",
  },
  {
    lyzrAgentId: process.env.LYZR_PRICE_GUARD_AGENT_ID || "6999933b83d9dff0252dd86f",
    name: "PriceGuard",
    tier: "safety",
    model: GPT_41,
    temperature: 0.0,
    maxTokens: 2500,
    rationale: "Deterministic pricing validation — zero creativity",
  },
  {
    lyzrAgentId: process.env.Marketing_Agent_ID || "699993adb8bd4d3aac102a81",
    name: "Marketing Agent",
    tier: "analyst",
    model: GEMINI_FLASH_LITE,
    temperature: 0.1,
    maxTokens: 2000,
    rationale: "Legacy agent — holidays now from static calendar; kept for Studio parity",
  },
  ...(process.env.LYZR_LISTING_OPTIMIZER_AGENT_ID
    ? [
        {
          lyzrAgentId: process.env.LYZR_LISTING_OPTIMIZER_AGENT_ID,
          name: "Listing Optimizer",
          tier: "analyst" as const,
          model: GEMINI_FLASH_LITE,
          temperature: 0.2,
          maxTokens: 3000,
          rationale: "OTA listing copy SEO — Airbnb/Booking/VRBO titles and descriptions",
        },
      ]
    : []),
  {
    lyzrAgentId: process.env.LYZR_Competitor_Benchmark_Agent_ID || "699e7b559ff614f6db8964cf",
    name: "Competitor Benchmark",
    tier: "internet",
    model: PERPLEXITY_SONAR,
    temperature: 0.2,
    maxTokens: 2000,
    rationale: "Live OTA rate scraping and percentile math",
  },
  {
    lyzrAgentId: process.env.Lyzr_Guardrail_Agent_for_Floor_Ceiling_Values || "69a941c5ad0c99ac601ac935",
    name: "Guardrails (Floor/Ceiling)",
    tier: "safety",
    model: GPT_41,
    temperature: 0.0,
    maxTokens: 2000,
    rationale: "Strict floor/ceiling enforcement",
  },
  {
    lyzrAgentId: process.env.LYZR_Conversation_Summary_Agent_ID || process.env.LYZR_CONVERSATION_SUMMARY_AGENT_ID || "699d6ba5d3183ea975c8c375",
    name: "Conversation Summary",
    tier: "guest",
    model: GEMINI_FLASH_LITE,
    temperature: 0.2,
    maxTokens: 2000,
    rationale: "Fast guest-thread summarization",
  },
  {
    lyzrAgentId: process.env.LYZR_Chat_Response_Agent_ID || process.env.LYZR_CHAT_RESPONSE_AGENT_ID || "699d8ab150b4c733eb376fd4",
    name: "Guest Reply",
    tier: "guest",
    model: GEMINI_FLASH,
    temperature: 0.3,
    maxTokens: 1500,
    rationale: "Warm accurate guest replies for demo inbox",
  },
  {
    lyzrAgentId: process.env.LYZR_DASHBOARD_AGENT_ID || "69df6b63fac6b1f936ca8e7b",
    name: "Dashboard Agent",
    tier: "orchestrator",
    model: GEMINI_FLASH,
    temperature: 0.2,
    maxTokens: 3000,
    rationale: "Fast portfolio-level Q&A",
  },
];

export function getLyzrModelSpec(agentId: string): LyzrModelSpec | undefined {
  return LYZR_AGENT_MODELS.find((s) => s.lyzrAgentId === agentId);
}
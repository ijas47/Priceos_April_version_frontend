/**
 * lib/agents/lyzr-config.ts
 *
 * Per-agent tool list registry for PriceOS Lyzr agents.
 * Maps each agent to its allowed OpenAPI tool operationIds, model,
 * and optional structured output schema.
 *
 * Model strings are sourced from lyzr-models.ts (synced to Lyzr Studio via
 * scripts/sync-lyzr-agent-models.mjs).
 */

import {
  GEMINI_FLASH,
  GEMINI_FLASH_LITE,
  GPT_4O_MINI,
  PERPLEXITY_SONAR,
} from "./lyzr-models";
import {
  PRICEGUARD_OUTPUT_SCHEMA,
  CRO_ROUTER_OUTPUT_SCHEMA,
  PROPERTY_ANALYST_OUTPUT_SCHEMA,
  BOOKING_INTELLIGENCE_OUTPUT_SCHEMA,
} from "./output-schemas";

import {
  MANAGER_AGENT_ID,
  PRICEGUARD_AGENT_ID,
  ARIA_AGENT_ID,
  BOOKING_AGENT_ID,
  BENCHMARK_AGENT_ID,
  GUARDRAILS_AGENT_ID,
  CONVERSATION_AGENT_ID,
  EVENT_AGENT_ID,
  MARKET_AGENT_ID,
  STRATEGY_AGENT_ID,
} from "./constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentToolConfig {
  /** Unique agent identifier (matches Lyzr agent registry) */
  agentId: string;
  /** Human-readable agent name */
  name: string;
  /** LLM model to use */
  model: string;
  /** Sampling temperature (0 = deterministic, 1 = creative) */
  temperature: number;
  /** Maximum output tokens */
  maxTokens: number;
  /** Allowed operationId values from the OpenAPI spec */
  tools: string[];
  /** Optional structured JSON output schema (OpenAI response_format) */
  outputSchema?: object;
}

// ---------------------------------------------------------------------------
// Tool operationId groups
// ---------------------------------------------------------------------------

/** Portfolio / dashboard-level tools */
const PORTFOLIO_TOOLS = [
  "get_portfolio_overview",
  "get_agent_system_status",
  "get_portfolio_revenue_snapshot",
] as const;

/** Property-level analysis tools */
const PROPERTY_TOOLS = [
  "get_property_profile",
  "get_property_calendar_metrics",
  "get_property_reservations",
  "get_property_market_events",
  "get_property_benchmark",
] as const;

/** Guest / conversation tools */
const GUEST_TOOLS = [
  "listThreads",
  "readThread",
  "sendGuestMessage",
  "createOpsTicket",
  "escalateThread",
  "closeThread",
  "sendAccessDetails",
  "getPropertyData",
  "sendUpsellOffer",
] as const;

/** Read-only guest tools (for summarization, no side-effects) */
const GUEST_READ_TOOLS = [
  "listThreads",
  "readThread",
  "getPropertyData",
] as const;

/** Market intelligence tools */
const MARKET_TOOLS = [
  "get_property_market_events",
  "get_property_benchmark",
] as const;

/** Reservation / booking tools */
const BOOKING_TOOLS = [
  "get_property_reservations",
  "get_property_calendar_metrics",
] as const;

/** Benchmark-only tool */
const BENCHMARK_TOOLS = [
  "get_property_benchmark",
] as const;

/** Guardrails agent tools (property profile only for context) */
const GUARDRAILS_TOOLS = [
  "get_property_profile",
] as const;

// ---------------------------------------------------------------------------
// Agent Configurations
// ---------------------------------------------------------------------------

export const AGENT_CONFIGS: Record<string, AgentToolConfig> = {
  // -------------------------------------------------------------------------
  // CRO Router (Dashboard) - Manager agent
  // All portfolio + system tools for full orchestration capability
  // -------------------------------------------------------------------------
  [MANAGER_AGENT_ID]: {
    agentId: MANAGER_AGENT_ID,
    name: "CRO Router",
    model: GEMINI_FLASH,
    temperature: 0.2,
    maxTokens: 3000,
    tools: [
      ...PORTFOLIO_TOOLS,
      ...PROPERTY_TOOLS,
      "get_agent_system_status",
    ],
    outputSchema: CRO_ROUTER_OUTPUT_SCHEMA,
  },

  // -------------------------------------------------------------------------
  // Property Analyst - Deep property-level analysis
  // Property-level tools only (no portfolio, no guest)
  // -------------------------------------------------------------------------
  [STRATEGY_AGENT_ID]: {
    agentId: STRATEGY_AGENT_ID,
    name: "Property Analyst",
    model: GEMINI_FLASH_LITE,
    temperature: 0.1,
    maxTokens: 2500,
    tools: [...PROPERTY_TOOLS],
    outputSchema: PROPERTY_ANALYST_OUTPUT_SCHEMA,
  },

  // -------------------------------------------------------------------------
  // Booking Intelligence - Reservation patterns & velocity
  // Reservations + calendar tools only
  // -------------------------------------------------------------------------
  [BOOKING_AGENT_ID]: {
    agentId: BOOKING_AGENT_ID,
    name: "Booking Intelligence",
    model: GEMINI_FLASH_LITE,
    temperature: 0.1,
    maxTokens: 2000,
    tools: [...BOOKING_TOOLS],
    outputSchema: BOOKING_INTELLIGENCE_OUTPUT_SCHEMA,
  },

  // -------------------------------------------------------------------------
  // Market Research / Event Intelligence
  // Market events + benchmark tools
  // -------------------------------------------------------------------------
  [EVENT_AGENT_ID]: {
    agentId: EVENT_AGENT_ID,
    name: "Market Research",
    model: GEMINI_FLASH_LITE,
    temperature: 0.1,
    maxTokens: 2000,
    tools: [...MARKET_TOOLS],
  },

  // -------------------------------------------------------------------------
  // PriceGuard - Safety-critical pricing validator
  // NO tools (zero DB access per prompt design)
  // UPGRADED to gpt-4o: this is the final safety gate for all pricing
  // -------------------------------------------------------------------------
  [PRICEGUARD_AGENT_ID]: {
    agentId: PRICEGUARD_AGENT_ID,
    name: "PriceGuard",
    model: GPT_4O_MINI,
    temperature: 0.0,
    maxTokens: 2000,
    tools: [],
    outputSchema: PRICEGUARD_OUTPUT_SCHEMA,
  },

  // -------------------------------------------------------------------------
  // Benchmark Agent - Market comparison data
  // Benchmark tool only
  // -------------------------------------------------------------------------
  [BENCHMARK_AGENT_ID]: {
    agentId: BENCHMARK_AGENT_ID,
    name: "Benchmark Agent",
    model: PERPLEXITY_SONAR,
    temperature: 0.2,
    maxTokens: 2000,
    tools: [...BENCHMARK_TOOLS],
  },

  // -------------------------------------------------------------------------
  // Guardrails Agent - Property profile validation
  // Property profile only (read-only context)
  // -------------------------------------------------------------------------
  [GUARDRAILS_AGENT_ID]: {
    agentId: GUARDRAILS_AGENT_ID,
    name: "Guardrails Agent",
    model: GPT_4O_MINI,
    temperature: 0.0,
    maxTokens: 1500,
    tools: [...GUARDRAILS_TOOLS],
  },

  // -------------------------------------------------------------------------
  // Conversation Summary - Guest thread summarization
  // Read-only guest tools (no send/escalate/close)
  // -------------------------------------------------------------------------
  [CONVERSATION_AGENT_ID]: {
    agentId: CONVERSATION_AGENT_ID,
    name: "Conversation Summary",
    model: GEMINI_FLASH_LITE,
    temperature: 0.2,
    maxTokens: 2000,
    tools: [...GUEST_READ_TOOLS],
  },

  // -------------------------------------------------------------------------
  // Aria (CRO Chat) - User-facing conversational agent
  // All tools for full portfolio + property + guest access
  // UPGRADED to gpt-4o: user-facing quality is critical
  // -------------------------------------------------------------------------
  [ARIA_AGENT_ID]: {
    agentId: ARIA_AGENT_ID,
    name: "Aria",
    model: GEMINI_FLASH,
    temperature: 0.2,
    maxTokens: 3000,
    tools: [
      ...PORTFOLIO_TOOLS,
      ...PROPERTY_TOOLS,
      ...GUEST_TOOLS,
    ],
  },

  // -------------------------------------------------------------------------
  // Market Agent (legacy UI panel reference)
  // -------------------------------------------------------------------------
  [MARKET_AGENT_ID]: {
    agentId: MARKET_AGENT_ID,
    name: "Market Agent",
    model: GEMINI_FLASH_LITE,
    temperature: 0.1,
    maxTokens: 2000,
    tools: [...MARKET_TOOLS],
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get the full configuration for an agent by its ID.
 * Returns undefined if the agent ID is not registered.
 */
export function getAgentConfig(agentId: string): AgentToolConfig | undefined {
  return AGENT_CONFIGS[agentId];
}

/**
 * Get the list of allowed tool operationIds for an agent.
 * Returns an empty array if the agent ID is not registered.
 */
export function getAgentTools(agentId: string): string[] {
  return AGENT_CONFIGS[agentId]?.tools ?? [];
}

/**
 * Get the model name configured for an agent.
 * Falls back to "gpt-4o-mini" if the agent ID is not registered.
 */
export function getAgentModel(agentId: string): string {
  return AGENT_CONFIGS[agentId]?.model ?? GEMINI_FLASH;
}

/**
 * Get the structured output schema for an agent, if one is defined.
 * Returns undefined if the agent has no output schema.
 */
export function getAgentOutputSchema(agentId: string): object | undefined {
  return AGENT_CONFIGS[agentId]?.outputSchema;
}

/**
 * Check whether a specific tool operationId is allowed for an agent.
 */
export function isToolAllowed(agentId: string, operationId: string): boolean {
  const tools = getAgentTools(agentId);
  return tools.includes(operationId);
}

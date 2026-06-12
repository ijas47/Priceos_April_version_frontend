/**
 * lib/agents/output-schemas.ts
 *
 * Structured JSON output schemas for PriceOS Lyzr agents.
 * These schemas enforce deterministic, parseable responses from each agent.
 *
 * Usage: Pass the schema object as the `response_format` parameter
 * when configuring agent LLM calls (OpenAI structured output mode).
 */

// ---------------------------------------------------------------------------
// PriceGuard (Adjustment Reviewer)
// Source: updated_prompts_2/05-price-guard.md
// ---------------------------------------------------------------------------
export const PRICEGUARD_OUTPUT_SCHEMA = {
  name: "price_guard_response",
  strict: true,
  schema: {
    type: "object",
    properties: {
      guardrail_profile_applied: {
        type: "string",
        description:
          "The market guardrail profile used (e.g., UAE_GCC, Europe, US_Leisure, US_Urban, Global)",
      },
      weekend_definition_applied: {
        type: "string",
        description:
          "Which days treated as weekend (e.g., fri_sat, sat_sun, thu_fri)",
      },
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            listing_id: { type: "integer" },
            date: { type: "string" },
            proposed_price: { type: "number" },
            verdict: {
              type: "string",
              enum: ["APPROVED", "REJECTED", "FLAGGED"],
            },
            risk_level: {
              type: "string",
              enum: ["low", "medium", "high"],
            },
            change_pct: { type: "integer" },
            adjusted_price: { type: ["number", "null"] },
            comparisons: {
              type: "object",
              properties: {
                vs_p50: {
                  type: "object",
                  properties: {
                    comp_price: { type: "number" },
                    diff_pct: { type: "integer" },
                  },
                  required: ["comp_price", "diff_pct"],
                  additionalProperties: false,
                },
                vs_recommended: {
                  type: "object",
                  properties: {
                    comp_price: { type: "number" },
                    diff_pct: { type: "integer" },
                  },
                  required: ["comp_price", "diff_pct"],
                  additionalProperties: false,
                },
                vs_top_comp: {
                  type: "object",
                  properties: {
                    comp_name: { type: "string" },
                    comp_price: { type: "number" },
                    diff_pct: { type: "integer" },
                  },
                  required: ["comp_name", "comp_price", "diff_pct"],
                  additionalProperties: false,
                },
              },
              required: ["vs_p50", "vs_recommended", "vs_top_comp"],
              additionalProperties: false,
            },
            reasoning: {
              type: "object",
              properties: {
                reason_market: { type: "string" },
                reason_benchmark: { type: "string" },
                reason_historic: { type: "string" },
                reason_seasonal: { type: "string" },
                reason_guardrails: { type: "string" },
                reason_news: { type: "string" },
              },
              required: [
                "reason_market",
                "reason_benchmark",
                "reason_historic",
                "reason_seasonal",
                "reason_guardrails",
                "reason_news",
              ],
              additionalProperties: false,
            },
          },
          required: [
            "listing_id",
            "date",
            "proposed_price",
            "verdict",
            "risk_level",
            "change_pct",
            "comparisons",
            "reasoning",
          ],
          additionalProperties: false,
        },
      },
      batch_summary: {
        type: "object",
        properties: {
          total: { type: "integer" },
          approved: { type: "integer" },
          rejected: { type: "integer" },
          flagged: { type: "integer" },
          portfolio_risk: {
            type: "string",
            enum: ["low", "medium", "high"],
          },
          avg_diff_vs_p50_pct: { type: "integer" },
          news_impact_applied: { type: "boolean" },
          net_news_factor_pct: { type: "integer" },
        },
        required: [
          "total",
          "approved",
          "rejected",
          "flagged",
          "portfolio_risk",
          "avg_diff_vs_p50_pct",
          "news_impact_applied",
          "net_news_factor_pct",
        ],
        additionalProperties: false,
      },
    },
    required: [
      "guardrail_profile_applied",
      "weekend_definition_applied",
      "results",
      "batch_summary",
    ],
    additionalProperties: false,
  },
} as const;

// ---------------------------------------------------------------------------
// CRO Router (Dashboard)
// Intent classification + delegation to worker agents
// ---------------------------------------------------------------------------
export const CRO_ROUTER_OUTPUT_SCHEMA = {
  name: "cro_router_response",
  strict: true,
  schema: {
    type: "object",
    properties: {
      intent: {
        type: "string",
        enum: [
          "pricing",
          "market",
          "booking",
          "guest",
          "system",
          "general",
        ],
        description: "Classified intent of the user query",
      },
      target_agent: {
        type: "string",
        description:
          "Agent ID to delegate to (e.g., property-analyst, booking-intelligence, priceguard-agent)",
      },
      confidence: {
        type: "number",
        description: "Routing confidence score between 0 and 1",
      },
      extracted_params: {
        type: "object",
        properties: {
          listing_id: { type: ["string", "null"] },
          date_from: { type: ["string", "null"] },
          date_to: { type: ["string", "null"] },
          action: { type: ["string", "null"] },
        },
        required: ["listing_id", "date_from", "date_to", "action"],
        additionalProperties: false,
      },
      reasoning: {
        type: "string",
        description:
          "Brief explanation of why this intent and agent were selected",
      },
    },
    required: [
      "intent",
      "target_agent",
      "confidence",
      "extracted_params",
      "reasoning",
    ],
    additionalProperties: false,
  },
} as const;

// ---------------------------------------------------------------------------
// Property Analyst
// Gaps analysis, revenue forecast, LOS recommendations
// ---------------------------------------------------------------------------
export const PROPERTY_ANALYST_OUTPUT_SCHEMA = {
  name: "property_analysis_response",
  strict: true,
  schema: {
    type: "object",
    properties: {
      listing_id: { type: "string" },
      analysis_period: {
        type: "object",
        properties: {
          from: { type: "string" },
          to: { type: "string" },
        },
        required: ["from", "to"],
        additionalProperties: false,
      },
      occupancy: {
        type: "object",
        properties: {
          current_pct: { type: "number" },
          forecast_pct: { type: "number" },
          trend: { type: "string", enum: ["improving", "stable", "declining"] },
        },
        required: ["current_pct", "forecast_pct", "trend"],
        additionalProperties: false,
      },
      gaps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            date_from: { type: "string" },
            date_to: { type: "string" },
            nights: { type: "integer" },
            gap_type: {
              type: "string",
              enum: ["orphan", "short_gap", "extended_vacancy", "seasonal"],
            },
            recommended_action: { type: "string" },
            suggested_discount_pct: { type: ["number", "null"] },
          },
          required: [
            "date_from",
            "date_to",
            "nights",
            "gap_type",
            "recommended_action",
          ],
          additionalProperties: false,
        },
      },
      revenue_forecast: {
        type: "object",
        properties: {
          projected_revenue: { type: "number" },
          revenue_at_risk: { type: "number" },
          upside_potential: { type: "number" },
          currency: { type: "string" },
        },
        required: [
          "projected_revenue",
          "revenue_at_risk",
          "upside_potential",
          "currency",
        ],
        additionalProperties: false,
      },
      los_recommendations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            period: { type: "string" },
            current_min_stay: { type: "integer" },
            recommended_min_stay: { type: "integer" },
            reason: { type: "string" },
          },
          required: [
            "period",
            "current_min_stay",
            "recommended_min_stay",
            "reason",
          ],
          additionalProperties: false,
        },
      },
      summary: { type: "string" },
    },
    required: [
      "listing_id",
      "analysis_period",
      "occupancy",
      "gaps",
      "revenue_forecast",
      "los_recommendations",
      "summary",
    ],
    additionalProperties: false,
  },
} as const;

// ---------------------------------------------------------------------------
// Booking Intelligence
// Booking patterns, velocity, lead time distribution
// ---------------------------------------------------------------------------
export const BOOKING_INTELLIGENCE_OUTPUT_SCHEMA = {
  name: "booking_intelligence_response",
  strict: true,
  schema: {
    type: "object",
    properties: {
      listing_id: { type: "string" },
      analysis_period: {
        type: "object",
        properties: {
          from: { type: "string" },
          to: { type: "string" },
        },
        required: ["from", "to"],
        additionalProperties: false,
      },
      booking_velocity: {
        type: "object",
        properties: {
          bookings_last_7d: { type: "integer" },
          bookings_last_30d: { type: "integer" },
          trend: {
            type: "string",
            enum: ["accelerating", "steady", "decelerating"],
          },
          avg_daily_rate: { type: "number" },
        },
        required: [
          "bookings_last_7d",
          "bookings_last_30d",
          "trend",
          "avg_daily_rate",
        ],
        additionalProperties: false,
      },
      lead_time_distribution: {
        type: "array",
        items: {
          type: "object",
          properties: {
            bucket: { type: "string" },
            count: { type: "integer" },
            pct: { type: "number" },
          },
          required: ["bucket", "count", "pct"],
          additionalProperties: false,
        },
      },
      channel_mix: {
        type: "array",
        items: {
          type: "object",
          properties: {
            channel: { type: "string" },
            bookings: { type: "integer" },
            revenue: { type: "number" },
            avg_los: { type: "number" },
          },
          required: ["channel", "bookings", "revenue", "avg_los"],
          additionalProperties: false,
        },
      },
      patterns: {
        type: "array",
        items: {
          type: "object",
          properties: {
            pattern: { type: "string" },
            significance: {
              type: "string",
              enum: ["high", "medium", "low"],
            },
            recommendation: { type: "string" },
          },
          required: ["pattern", "significance", "recommendation"],
          additionalProperties: false,
        },
      },
      summary: { type: "string" },
    },
    required: [
      "listing_id",
      "analysis_period",
      "booking_velocity",
      "lead_time_distribution",
      "channel_mix",
      "patterns",
      "summary",
    ],
    additionalProperties: false,
  },
} as const;

/**
 * Insight Agent Prompt
 *
 * Structure: ROLE → GOAL → CONTEXT → INSTRUCTIONS → EXAMPLES → OUTPUT SCHEMA
 *
 * The Insight Agent runs per property group after detectors emit signals.
 * It cross-references signals across MECE categories (demand / supply / pricing /
 * external / distribution) and produces 0–5 actionable insight cards saved to
 * the Insight collection for HITL review.
 */

interface PropertyContext {
  id: string;
  name: string;
  basePrice: number;
  priceFloor: number;
  priceCeiling: number;
}

interface StrategyContext {
  name: string;
  priceAdjPct: number | null;
  startDate: string;
  endDate: string;
  enabled: boolean;
}

interface SignalInput {
  detectorKey: string;
  metric: string;
  value: number;
  baseline: number | null;
  delta: number | null;
  deltaPct: number | null;
  direction: string | null;
  severity: string | null;
}

// ── OpenAI Structured Output Schema ──────────────────────────────────────────

export const INSIGHT_OUTPUT_SCHEMA = {
  name: "insight_array",
  strict: true,
  schema: {
    type: "array",
    items: {
      type: "object",
      properties: {
        module: {
          type: "string",
          enum: ["pricing", "inbox", "content"],
          description: "Which product module this insight targets",
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Urgency of the insight",
        },
        title: {
          type: "string",
          description: "Short actionable headline, max 80 characters",
        },
        description: {
          type: "string",
          description: "2–3 sentences: what signal was detected, why it matters, what to do",
        },
        category: {
          type: "string",
          enum: [
            "demand_booking_pace",
            "demand_lead_time",
            "demand_cancellation",
            "supply_occupancy",
            "supply_gaps",
            "supply_los",
            "pricing_competitor",
            "pricing_dow",
            "pricing_reviews",
            "external_events",
            "external_seasonality",
            "distribution_channel_mix",
          ],
          description: "MECE signal category that drove this insight",
        },
        action: {
          type: "object",
          description: "Structured action for the HITL executor.",
          properties: {
            type: {
              type: "string",
              enum: ["adjust_price", "adjust_min_stay", "create_strategy", "manual"],
            },
            listingId: { type: "string" },
            dates: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  date: { type: "string" },
                  price: { type: "number" },
                  minStay: { type: "number" },
                },
                additionalProperties: false,
              },
            },
            strategy: {
              type: "object",
              properties: {
                name: { type: "string" },
                priceAdjPct: { type: "number" },
                startDate: { type: "string" },
                endDate: { type: "string" },
              },
              additionalProperties: false,
            },
            instruction: { type: "string" },
          },
          required: ["type"],
          additionalProperties: false,
        },
        affectedListings: {
          type: "array",
          items: { type: "string" },
          description: "Property IDs affected by this insight",
        },
      },
      required: ["module", "priority", "title", "description", "category", "action", "affectedListings"],
      additionalProperties: false,
    },
  },
} as const;

// ── Prompt Builder ────────────────────────────────────────────────────────────

export function buildInsightAgentPrompt(
  groupName: string,
  properties: PropertyContext[],
  strategies: StrategyContext[],
  signals: SignalInput[],
  currency: string = "AED",
): string {
  const propList = properties
    .map(
      (p) =>
        `  - ${p.name} (ID: ${p.id}): base ${p.basePrice} ${currency}, floor ${p.priceFloor} ${currency}, ceiling ${p.priceCeiling} ${currency}`,
    )
    .join("\n");

  const stratList =
    strategies.length > 0
      ? strategies
          .map(
            (s) =>
              `  - [${s.enabled ? "ACTIVE" : "INACTIVE"}] ${s.name}: ${s.priceAdjPct != null ? `${s.priceAdjPct > 0 ? "+" : ""}${s.priceAdjPct}%` : "no price adj"} (${s.startDate} → ${s.endDate})`,
          )
          .join("\n")
      : "  (none active)";

  const catMap: Record<string, string> = {
    booking: "DEMAND",
    lead: "DEMAND",
    cancellation: "DEMAND",
    occupancy: "SUPPLY",
    gap: "SUPPLY",
    length: "SUPPLY",
    competitor: "PRICING",
    day: "PRICING",
    review: "PRICING",
    event: "EXTERNAL",
    seasonality: "EXTERNAL",
    channel: "DISTRIBUTION",
  };

  const signalsByCategory: Record<string, string[]> = {
    DEMAND: [], SUPPLY: [], PRICING: [], EXTERNAL: [], DISTRIBUTION: [],
  };

  for (const s of signals) {
    const prefix = s.detectorKey.split("_")[0];
    const cat = catMap[prefix] || "EXTERNAL";
    const dirSymbol = s.direction === "up" ? "↑" : s.direction === "down" ? "↓" : "→";
    const deltaStr = s.deltaPct != null ? ` (${s.deltaPct > 0 ? "+" : ""}${s.deltaPct.toFixed(1)}%)` : "";
    const baseStr = s.baseline != null ? ` vs baseline ${s.baseline}` : "";
    const line = `  [${s.severity?.toUpperCase() || "INFO"}] ${s.metric}: ${s.value}${baseStr}${deltaStr} ${dirSymbol}`;
    signalsByCategory[cat].push(line);
  }

  const signalBlock = Object.entries(signalsByCategory)
    .map(([cat, lines]) => {
      if (lines.length === 0) return `SIGNALS/${cat}: (none)`;
      return `SIGNALS/${cat}:\n${lines.join("\n")}`;
    })
    .join("\n\n");

  const listingIds = properties.map((p) => p.id);

  return `## ROLE

You are the Insight Agent - an autonomous revenue analyst embedded in the PriceOS intelligence pipeline.
You run after detectors have emitted fresh market signals for a property group.
You synthesize cross-signal patterns into actionable insight cards for human review (HITL).
You never directly modify prices or calendars - you propose; a human approves.

---

## GOAL

Analyze the fresh detector signals below and produce 0–5 insight cards.
Each card must:
- Cross-reference at least two signal categories when possible (compound insights are stronger than single-signal ones)
- Propose a concrete action the property manager can approve in one click
- Respect the property's floor/ceiling guardrails in any price suggestion
- Be silent (return []) if signals are within normal/expected range

Currency for all monetary values: **${currency}**

---

## PORTFOLIO CONTEXT

**Group:** "${groupName}" (${properties.length} propert${properties.length === 1 ? "y" : "ies"})

**Properties:**
${propList}

**Active Strategies:**
${stratList}

---

## FRESH SIGNALS (last 24 hours)

${signalBlock}

---

## INSTRUCTIONS

**Step 1 - Triage signals**
Rank signals by severity: WARNING signals first, INFO signals second.
Ignore signals with no delta or direction (flat/stable = no action needed).

**Step 2 - Find compound patterns**
Look for signal pairs that reinforce each other:
| Demand Signal | Supply/Pricing Signal | Compound Insight |
|---|---|---|
| booking_pace UP +23% | occupancy < 40% available | Demand outpacing supply - raise prices before dates fill |
| booking_pace DOWN -15% | competitor_rate DOWN | Market softening - match competitor discount to protect occupancy |
| event_impact HIGH | competitor_rate UP | Both signals confirm demand spike - aggressive surge recommended |
| cancellation_rate HIGH | lead_time SHORT | High last-minute cancellation risk - require deposit or min stay |
| gap_analysis: gaps found | length_of_stay: avg LOS > 3 | Gap fill opportunity - reduce min stay for gap nights |
| seasonality LOW | occupancy LOW | Double low-season signal - activate promotional pricing |

**Step 3 - Write the insight**
- Title: action-oriented, specific (include % or ${currency} amount), max 80 chars
- Description: What signal → why it matters → what the proposed action does
- Action: Only propose changes within floor/ceiling bounds

**Step 4 - Validate**
- affectedListings must only contain IDs from: [${listingIds.join(", ")}]
- Prices must be ≥ floor and ≤ ceiling for each property
- Do NOT generate insights for flat/info signals with no delta
- Maximum 5 insights per run

---

## EXAMPLES

### Example 1 - Compound demand + external signal (CORRECT)
Signals: booking_pace +23% (WARNING), event_impact 1.4× HIGH, competitor_rate UP 8%

\`\`\`json
{
  "module": "pricing",
  "priority": "high",
  "title": "Event demand spike: raise rates +20% for next 14 days",
  "description": "Booking pace is 23% above baseline and an upcoming high-impact event drives a 1.4× demand multiplier. Competitors have already raised rates 8%. Current rate is leaving revenue on the table - propose a +20% strategy for event dates.",
  "category": "external_events",
  "action": {
    "type": "create_strategy",
    "strategy": {
      "name": "Event Surge +20%",
      "priceAdjPct": 20,
      "startDate": "2026-04-20",
      "endDate": "2026-04-27"
    }
  },
  "affectedListings": ["prop-id-1", "prop-id-2"]
}
\`\`\`

### Example 2 - Gap fill opportunity (CORRECT)
Signals: gap_analysis: 3 gaps of 1–2 nights, length_of_stay: avg 4.2 nights

\`\`\`json
{
  "module": "pricing",
  "priority": "medium",
  "title": "3 orphan gaps detected - reduce min stay to fill",
  "description": "Three 1–2 night gaps exist between confirmed bookings in the next 30 days. Average LOS is 4.2 nights, suggesting guests prefer longer stays. Reducing min stay for gap nights and discounting -12% will maximize revenue from otherwise-empty nights.",
  "category": "supply_gaps",
  "action": {
    "type": "adjust_min_stay",
    "listingId": "prop-id-1",
    "dates": [
      { "date": "2026-04-15", "minStay": 1 },
      { "date": "2026-04-16", "minStay": 1 }
    ]
  },
  "affectedListings": ["prop-id-1"]
}
\`\`\`

### Example 3 - Do NOT generate (WRONG pattern to avoid)
Signal: booking_pace flat (0.2% delta), direction: flat, severity: info

Return \`[]\` - never generate an insight for a flat/expected signal.

### Example 4 - Channel mix warning (CORRECT)
Signal: channel_mix: Airbnb 84% concentration (WARNING)

\`\`\`json
{
  "module": "pricing",
  "priority": "medium",
  "title": "84% Airbnb dependency - revenue at channel risk",
  "description": "Over 84% of bookings are sourced from Airbnb, creating concentration risk if the platform changes fees or algorithms. Industry benchmark is <60% single-channel. Consider adding a direct booking discount or activating Booking.com for underperforming dates.",
  "category": "distribution_channel_mix",
  "action": {
    "type": "manual",
    "instruction": "Add direct booking discount of 8% and review Booking.com listing activation for low-season dates"
  },
  "affectedListings": [${listingIds.map((id) => `"${id}"`).join(", ")}]
}
\`\`\`

---

## OUTPUT SCHEMA

Return a **JSON array** of 0–5 insight objects conforming to the schema above.

Return ONLY valid JSON. No markdown fences. No explanatory text. Return [] if no action is warranted.`;
}

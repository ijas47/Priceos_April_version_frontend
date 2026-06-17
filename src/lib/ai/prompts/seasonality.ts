/**
 * Seasonality Source Prompt
 *
 * Structure: ROLE → GOAL → CONTEXT → INSTRUCTIONS → EXAMPLES → OUTPUT SCHEMA
 *
 * The Seasonality Source calls this prompt once per area per year.
 * It asks the AI to produce a 12-month demand profile for the given
 * market area - used by the seasonality detector to compute demand
 * index multipliers and flag low/high season signals.
 *
 * Market-neutral: currency and market injected at call time from org.settings.
 */

// ── OpenAI Structured Output Schema ──────────────────────────────────────────

export const SEASONALITY_OUTPUT_SCHEMA = {
  name: "seasonality_array",
  strict: true,
  schema: {
    type: "array",
    items: {
      type: "object",
      properties: {
        month: {
          type: "number",
          description: "Calendar month number (1 = January, 12 = December)",
        },
        year: {
          type: "number",
          description: "Calendar year (e.g. 2026)",
        },
        demandIndex: {
          type: "number",
          description:
            "Relative demand score where 100 = annual average baseline. Values > 100 indicate above-average demand; < 100 below-average.",
        },
        avgDailyRate: {
          type: "number",
          description:
            "Expected average daily rate (ADR) in the market currency for this area and month",
        },
        avgOccupancy: {
          type: "number",
          description:
            "Expected occupancy percentage for this month (0–100)",
        },
        yoyChange: {
          type: "number",
          description:
            "Estimated year-over-year percentage change in ADR vs the same month last year (positive = growth)",
        },
        peakDays: {
          type: "array",
          items: { type: "string" },
          description:
            "YYYY-MM-DD dates of highest within-month demand (holidays, events, long weekends). Max 5 dates.",
        },
        troughDays: {
          type: "array",
          items: { type: "string" },
          description:
            "YYYY-MM-DD dates of lowest within-month demand. Max 5 dates.",
        },
        notes: {
          type: "string",
          description:
            "1–2 sentences explaining the dominant seasonal driver for this month",
        },
      },
      required: [
        "month",
        "year",
        "demandIndex",
        "avgDailyRate",
        "avgOccupancy",
        "yoyChange",
        "peakDays",
        "troughDays",
        "notes",
      ],
      additionalProperties: false,
    },
  },
} as const;

// ── Prompt Builder ────────────────────────────────────────────────────────────

export function buildSeasonalityPrompt(
  area: string,
  year: number,
  currency: string = "AED",
  market: string = "Dubai",
): string {
  const areaLabel = area === "all" ? `all areas of ${market}` : `${area}, ${market}`;

  return `## ROLE

You are a short-term rental demand analyst specializing in the **${market}** market.
You produce 12-month seasonal demand profiles used by the PriceOS pricing engine
to set baseline demand multipliers, flag high/low season windows, and calibrate
nightly rate recommendations throughout the year.

You are accurate about known seasonal patterns (weather, holidays, events, tourism
flows) and conservative when estimating growth - you base year-over-year projections
on observable market trends, not optimistic assumptions.

---

## GOAL

Produce a full-year seasonality profile for **${areaLabel}** for the year **${year}**.

This profile feeds the **seasonality detector**, which:
1. Reads each month's \`demandIndex\` and \`avgOccupancy\` to classify the current
   period as peak / shoulder / low season.
2. Uses \`avgDailyRate\` as the market ADR baseline when no competitor data is available.
3. Surfaces season-level insights to alert property managers to upcoming demand shifts.

All monetary values in **${currency}**.

---

## CONTEXT

| Field | Value |
|---|---|
| Market | ${market} |
| Area | ${areaLabel} |
| Year | ${year} |
| Currency | ${currency} |
| Use case | Seasonal demand baseline for STR pricing engine |

**Demand index scale:**
| Index | Season label | Typical occupancy | Pricing posture |
|---|---|---|---|
| ≥ 130 | Peak | 85–95% | Aggressive surge pricing |
| 105–129 | High shoulder | 75–85% | Premium pricing, monitor sell-out |
| 90–104 | Shoulder | 65–75% | Maintain rates, limited discounting |
| 70–89 | Low shoulder | 55–65% | Promotional pricing, min-stay reduction |
| < 70 | Low / trough | < 55% | Maximum discounts, minimum rates |

---

## INSTRUCTIONS

1. **Return exactly 12 entries** - one per calendar month (month 1–12), all for year ${year}.

2. **Base demand on observable factors:**
   - Weather / climate patterns for the area
   - National and local public holidays in the window
   - Known recurring annual events (conferences, festivals, sports)
   - School holiday calendars (domestic + key source markets)
   - Tourism seasonality trends from STR platforms

3. **ADR estimation:**
   - Use realistic market rates for the specific area and bedroom mix
   - Scale ADR proportionally with demandIndex (peak months should show higher ADR)
   - Avoid round numbers - use realistic precision (e.g. 547, not 500)

4. **peakDays and troughDays:**
   - List specific dates within the month (YYYY-MM-DD format)
   - peakDays: public holidays, long weekends, event dates, event eve nights
   - troughDays: typically mid-week in low season; specific slow periods
   - Limit to 5 dates each - only list dates you are reasonably confident about

5. **yoyChange:** Estimate based on market growth trend. Typical STR markets
   show 3–8% YoY ADR growth in healthy conditions; negative during macro downturns.

6. **Notes:** Be specific. Name the seasonal driver (e.g. "Ramadan reduces leisure
   demand; Eid al-Fitr creates a 3-day spike at month end" rather than "demand is low").

---

## EXAMPLES

### Example 1 - Peak month (high season)

\`\`\`json
{
  "month": 12,
  "year": 2026,
  "demandIndex": 148,
  "avgDailyRate": 712,
  "avgOccupancy": 91,
  "yoyChange": 5.2,
  "peakDays": ["2026-12-02", "2026-12-03", "2026-12-24", "2026-12-31"],
  "troughDays": ["2026-12-08", "2026-12-09"],
  "notes": "December is peak season driven by Dubai Shopping Festival launch, UAE National Day long weekend (Dec 2–3), Christmas holiday travel, and New Year's Eve near Burj Khalifa drawing 2–3× rate premiums on Dec 31."
}
\`\`\`

### Example 2 - Low season trough month

\`\`\`json
{
  "month": 8,
  "year": 2026,
  "demandIndex": 58,
  "avgDailyRate": 298,
  "avgOccupancy": 49,
  "yoyChange": 2.1,
  "peakDays": ["2026-08-14", "2026-08-15"],
  "troughDays": ["2026-08-03", "2026-08-04", "2026-08-10", "2026-08-11", "2026-08-18"],
  "notes": "August is the deepest trough of the year - extreme heat (45°C+) eliminates outdoor tourism. Mid-week days in the first three weeks are consistently the slowest; any lift comes from short-haul GCC residents seeking mall-based staycations on weekends."
}
\`\`\`

### Example 3 - Shoulder month with embedded event spike

\`\`\`json
{
  "month": 10,
  "year": 2026,
  "demandIndex": 118,
  "avgDailyRate": 534,
  "avgOccupancy": 79,
  "yoyChange": 4.7,
  "peakDays": ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"],
  "troughDays": ["2026-10-05", "2026-10-06"],
  "notes": "October marks the start of the high season as temperatures drop to 30°C. GITEX Global (Oct 12–16) creates a localized demand spike of +25–30% in Business Bay and DIFC sub-markets; the rest of the month is solid shoulder demand."
}
\`\`\`

### Example 4 - Ramadan month (variable, event-driven)

\`\`\`json
{
  "month": 3,
  "year": 2026,
  "demandIndex": 82,
  "avgDailyRate": 421,
  "avgOccupancy": 62,
  "yoyChange": 1.8,
  "peakDays": ["2026-03-29", "2026-03-30", "2026-03-31"],
  "troughDays": ["2026-03-02", "2026-03-09", "2026-03-16"],
  "notes": "Ramadan (expected mid-Feb to mid-Mar 2026) suppresses leisure tourism during fasting hours. Early Ramadan dates see -15% occupancy vs non-Ramadan March; Eid al-Fitr at month end creates a sharp 3-day recovery spike with +30–40% ADR lift as domestic and regional visitors arrive."
}
\`\`\`

---

## OUTPUT SCHEMA

Return a **JSON array of exactly 12 objects** - one per month, ordered month 1 through 12.

Return ONLY valid JSON array. No markdown fences. No explanatory text. Array must have exactly 12 elements.`;
}

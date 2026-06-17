/**
 * Events Source Prompt - AI Fallback
 *
 * Structure: ROLE → GOAL → CONTEXT → INSTRUCTIONS → EXAMPLES → OUTPUT SCHEMA
 *
 * This prompt is used ONLY when TICKETMASTER_API_KEY is not set.
 * When the key is present, real Ticketmaster data is used instead.
 *
 * Market-neutral: area and date range injected at call time.
 * The AI generates plausible upcoming events that could affect STR demand.
 */

// ── OpenAI Structured Output Schema ──────────────────────────────────────────

export const EVENTS_OUTPUT_SCHEMA = {
  name: "events_array",
  strict: true,
  schema: {
    type: "array",
    items: {
      type: "object",
      properties: {
        eventName: {
          type: "string",
          description: "Official or well-known name of the event",
        },
        eventCategory: {
          type: "string",
          enum: ["conference", "festival", "sports", "holiday", "concert", "exhibition", "cultural"],
          description: "Primary category of the event",
        },
        startDate: {
          type: "string",
          description: "Event start date in YYYY-MM-DD format",
        },
        endDate: {
          type: "string",
          description: "Event end date in YYYY-MM-DD format (same as startDate for 1-day events)",
        },
        expectedImpact: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Expected impact on short-term rental demand in the area",
        },
        estimatedAttendance: {
          type: ["number", "null"],
          description: "Estimated total attendance, or null if unknown",
        },
        description: {
          type: "string",
          description: "1–2 sentences describing the event and why it affects STR demand",
        },
        source: {
          type: "string",
          description: "Knowledge source (e.g. 'Annual calendar', 'Official event website', 'Historical pattern')",
        },
        confidence: {
          type: "number",
          description: "Confidence score 0.0–1.0 that this event occurs in this date range",
        },
      },
      required: ["eventName", "eventCategory", "startDate", "endDate", "expectedImpact", "estimatedAttendance", "description", "source", "confidence"],
      additionalProperties: false,
    },
  },
} as const;

// ── Prompt Builder ────────────────────────────────────────────────────────────

export function buildEventsPrompt(
  area: string,
  lookAheadDays: number = 90,
): string {
  const today = new Date().toISOString().slice(0, 10);
  const endDate = new Date(Date.now() + lookAheadDays * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const areaLabel = area === "all" ? "the city (all areas)" : `${area}`;

  return `## ROLE

You are an events intelligence analyst for short-term rental revenue management.
You identify upcoming events that create demand spikes for temporary accommodation -
conferences, sports events, festivals, holidays, concerts, and exhibitions.
You are precise about dates, realistic about attendance, and conservative about
confidence scores (only claim high confidence for annual/recurring events).

---

## GOAL

Identify upcoming events in **${areaLabel}** between **${today}** and **${endDate}**
that a property manager should know about to adjust pricing in advance.

This data feeds the **event_impact detector**, which translates events into
demand multiplier signals (1.1× low, 1.25× medium, 1.4× high impact).
The detector runs per property group, matching on area + date range.

---

## CONTEXT

| Field | Value |
|---|---|
| Target area | ${areaLabel} |
| Date range | ${today} → ${endDate} |
| Lookahead | ${lookAheadDays} days |
| Use case | STR demand spike detection |

**Impact classification guide:**
| Impact | Typical criteria | Demand multiplier |
|---|---|---|
| \`low\` | Local events, < 5,000 attendees, niche audience | 1.1× |
| \`medium\` | Regional events, 5,000–50,000 attendees, mixed tourism | 1.25× |
| \`high\` | National/international events, > 50,000 attendees, or major annual fixtures | 1.4× |

---

## INSTRUCTIONS

1. **Recall recurring annual events** that fall within the date window. These are
   your highest-confidence entries (annual calendar = 0.85–0.95 confidence).

2. **Recall confirmed scheduled events** that you know are happening in this period
   based on your training data (official announcements, confirmed dates = 0.70–0.85).

3. **Do not fabricate** events you are not reasonably confident about. If unsure
   whether an event is in this specific window, either omit it or use confidence ≤ 0.50
   and note the uncertainty in \`description\`.

4. **Focus on events that drive overnight demand** - avoid day-trip events that
   primarily attract locals who would not need accommodation.

5. **Date precision matters** - use the best known dates. For multi-day events,
   use the full span. For single days, set \`endDate\` = \`startDate\`.

6. **Return only events within the date window** (${today} to ${endDate}).
   Do not return events outside this range even if they are important.

---

## EXAMPLES

### Example 1 - High-confidence recurring annual event

\`\`\`json
{
  "eventName": "GITEX Global 2026",
  "eventCategory": "conference",
  "startDate": "2026-10-12",
  "endDate": "2026-10-16",
  "expectedImpact": "high",
  "estimatedAttendance": 180000,
  "description": "One of the world's largest technology conferences held annually at Dubai World Trade Centre. Drives 80–90% occupancy spikes in Business Bay and DIFC areas as 180,000+ international tech professionals attend.",
  "source": "Annual calendar - GITEX Global confirmed dates",
  "confidence": 0.92
}
\`\`\`

### Example 2 - Medium-confidence scheduled event

\`\`\`json
{
  "eventName": "Art Dubai 2026",
  "eventCategory": "exhibition",
  "startDate": "2026-03-18",
  "endDate": "2026-03-22",
  "expectedImpact": "medium",
  "estimatedAttendance": 35000,
  "description": "Annual contemporary art fair at Madinat Jumeirah attracting gallery owners, collectors and art tourists from 50+ countries. Niche luxury audience concentrated in DIFC and Downtown Dubai.",
  "source": "Art Dubai official calendar - annually held in March",
  "confidence": 0.80
}
\`\`\`

### Example 3 - Public holiday (high confidence, variable attendance)

\`\`\`json
{
  "eventName": "UAE National Day",
  "eventCategory": "holiday",
  "startDate": "2026-12-02",
  "endDate": "2026-12-03",
  "expectedImpact": "medium",
  "estimatedAttendance": null,
  "description": "UAE National Day public holiday. Creates a domestic long-weekend travel surge particularly to Dubai Marina, JBR, and Palm Jumeirah. Hotels and STRs typically see +15–20% ADR lift.",
  "source": "UAE official public holiday calendar",
  "confidence": 0.99
}
\`\`\`

### Example 4 - Low confidence event (do NOT fabricate as high confidence)

\`\`\`json
{
  "eventName": "Dubai International Film Festival",
  "eventCategory": "festival",
  "startDate": "2026-12-09",
  "endDate": "2026-12-16",
  "expectedImpact": "low",
  "estimatedAttendance": 12000,
  "description": "Annual film festival if it resumes - the event was paused in 2018 and its return schedule is uncertain. Include with low confidence given scheduling uncertainty.",
  "source": "Historical calendar - uncertain if 2026 edition confirmed",
  "confidence": 0.35
}
\`\`\`

---

## OUTPUT SCHEMA

Return a **JSON array** of event objects. Return \`[]\` if no events in the window are known.

Return ONLY valid JSON array. No markdown fences. No explanatory text.`;
}

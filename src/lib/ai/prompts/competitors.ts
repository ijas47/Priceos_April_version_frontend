/**
 * Competitor Scanner Prompt
 *
 * Structure: ROLE → GOAL → CONTEXT → INSTRUCTIONS → EXAMPLES → OUTPUT SCHEMA
 *
 * The Competitor Source calls this prompt once per property group.
 * It asks the AI to simulate realistic competitor market rates for the segment
 * until a real scraping / AirDNA / Pricelabs data source is wired in.
 *
 * Market-neutral: currency and market injected at call time from org.settings.
 */

interface ListingContext {
  name: string;
  basePrice: number;
  bedrooms: number;
  area: string;
}

interface GroupContext {
  name: string;
  area: string;
  bedrooms: number;
  propertyType?: string;
  listings: ListingContext[];
}

// ── OpenAI Structured Output Schema ──────────────────────────────────────────

export const COMPETITOR_OUTPUT_SCHEMA = {
  name: "competitor_snapshot",
  strict: true,
  schema: {
    type: "object",
    properties: {
      avgRate: {
        type: "number",
        description: "Mean nightly rate across comparable listings in the segment",
      },
      medianRate: {
        type: "number",
        description: "Median nightly rate - more robust to outliers",
      },
      minRate: {
        type: "number",
        description: "Lowest active listing rate in the segment",
      },
      maxRate: {
        type: "number",
        description: "Highest active listing rate in the segment",
      },
      sampleSize: {
        type: "number",
        description: "Number of comparable active listings analyzed",
      },
      occupancyPct: {
        type: "number",
        description: "Estimated market occupancy percentage (0–100) for this segment",
      },
      positioning: {
        type: "string",
        enum: ["below_market", "at_market", "above_market"],
        description: "Where our average rate sits relative to market median",
      },
      insights: {
        type: "string",
        description: "2–3 sentence narrative: key competitive dynamics, demand signals, pricing pressure",
      },
    },
    required: ["avgRate", "medianRate", "minRate", "maxRate", "sampleSize", "occupancyPct", "positioning", "insights"],
    additionalProperties: false,
  },
} as const;

// ── Prompt Builder ────────────────────────────────────────────────────────────

export function buildCompetitorPrompt(
  group: GroupContext,
  snapshotDate: string,
  currency: string = "AED",
  market: string = "Dubai",
): string {
  const bedroomLabel =
    group.bedrooms === 0 ? "Studio" : `${group.bedrooms}-bedroom`;

  const ourAvg =
    group.listings.reduce((sum, l) => sum + l.basePrice, 0) /
    (group.listings.length || 1);

  const listingList = group.listings
    .map(
      (l) =>
        `  - ${l.name}: ${currency} ${l.basePrice.toLocaleString("en-US")}/night, ${l.bedrooms === 0 ? "Studio" : `${l.bedrooms}BR`}`,
    )
    .join("\n");

  return `## ROLE

You are a short-term rental market intelligence analyst specializing in **${market}**.
You estimate real-time competitor pricing and occupancy for specific property segments using
your knowledge of OTA platforms (Airbnb, Booking.com, VRBO) and local market dynamics.

---

## GOAL

Produce a competitive market snapshot for a specific property segment in **${group.area}, ${market}**.
This snapshot is used by the PriceOS pricing engine to:
1. Detect whether our properties are priced above or below market.
2. Trigger rate-correction insights when the gap exceeds ±10%.
3. Track market occupancy trends to anticipate demand shifts.

All monetary values in **${currency}**.

---

## CONTEXT - SEGMENT BEING ANALYZED

| Field | Value |
|---|---|
| Market | ${market} |
| Area | ${group.area} |
| Segment | ${bedroomLabel} apartments |
| Property type | ${group.propertyType ?? "Apartment"} |
| Snapshot date | ${snapshotDate} |
| Our properties | ${group.listings.length} unit(s) |
| Our average rate | ${currency} ${Math.round(ourAvg).toLocaleString("en-US")}/night |

**Our Properties in This Segment:**
${listingList}

---

## INSTRUCTIONS

1. **Define the comparable set**: Identify ${bedroomLabel} short-term rentals in ${group.area}, ${market}
   that are actively listed on Airbnb and/or Booking.com on ${snapshotDate}.

2. **Estimate rates**: Based on your training knowledge of this market segment:
   - Consider current season, day of week, and any known upcoming events
   - Exclude outlier luxury/budget properties > 2 standard deviations from median
   - Target a sample size of 10–30 comparables for statistical validity

3. **Estimate occupancy**: Use your knowledge of typical occupancy rates for this
   segment, area, and time of year. Express as a percentage (0–100).

4. **Determine positioning**: Compare our average rate (${currency} ${Math.round(ourAvg).toLocaleString("en-US")}) to the market median:
   - \`below_market\`: our avg < median × 0.95
   - \`at_market\`: our avg is within ±5% of median
   - \`above_market\`: our avg > median × 1.05

5. **Write insights**: 2–3 sentences covering:
   - Key competitive dynamics right now (seasonal pressure, event demand, OTA algorithm changes)
   - Whether competitors are offering discounts or premiums
   - Specific actionable recommendation (raise by X%, maintain, or discount)

---

## EXAMPLES

### Example 1 - Peak season, above-market positioning

**Segment:** Dubai Marina, 1BR, Nov 15, 2026

\`\`\`json
{
  "avgRate": 620,
  "medianRate": 598,
  "minRate": 420,
  "maxRate": 950,
  "sampleSize": 24,
  "occupancyPct": 88,
  "positioning": "above_market",
  "insights": "Dubai Marina 1BR segment is in peak season with 88% estimated occupancy - demand is strong. Our rate of ${currency} 650 sits 8.7% above the market median of ${currency} 598. At this occupancy level the premium is defensible, but properties priced over ${currency} 700 are seeing longer booking windows. Recommend maintaining current rates and monitoring daily."
}
\`\`\`

### Example 2 - Low season, below-market positioning

**Segment:** JVC, Studio, Aug 1, 2026

\`\`\`json
{
  "avgRate": 285,
  "medianRate": 290,
  "minRate": 195,
  "maxRate": 420,
  "sampleSize": 18,
  "occupancyPct": 54,
  "positioning": "below_market",
  "insights": "JVC studio market is in the summer trough with only 54% occupancy. Competitors are heavily promoting - minRate has dropped to ${currency} 195 from ${currency} 240 last month. Our rate of ${currency} 275 is 5.2% below the median, which should help competitiveness, but even discounted properties are seeing slow fill rates. Recommend reducing min-stay to 1 night and adding a last-minute 10% discount for dates within 7 days."
}
\`\`\`

### Example 3 - Insufficient data

If no reliable estimate is possible for the segment, return your best estimate with
a lower sampleSize (< 5) and note uncertainty in the insights field. Never return 0
for avgRate or medianRate.

---

## OUTPUT SCHEMA

Return a single JSON object. No markdown fences. No explanatory text outside the JSON object.`;
}

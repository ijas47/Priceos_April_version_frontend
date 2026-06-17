/**
 * User-facing definitions for pricing abbreviations and strategy fields.
 */

export const PRICING_GLOSSARY = {
  lm: {
    short: "LM",
    label: "Last minute",
    description:
      "Discounts on unsold nights close to check-in. Gradual mode tapers from max % at day 1 to min % at the last day in the window.",
  },
  mlos: {
    short: "MLOS",
    label: "Minimum length of stay",
    description:
      "Minimum nights a guest must book. Can vary by weekday vs weekend, season, far-out lead time, or nights before a blocked date.",
  },
  los: {
    short: "LOS",
    label: "Length of stay",
    description: "How many nights a booking covers. Used in gap-fill and minimum-stay rules.",
  },
  wd: {
    short: "wd",
    label: "Weekday",
    description: "Sunday through Thursday minimum-stay nights (UAE default).",
  },
  we: {
    short: "we",
    label: "Weekend",
    description: "Friday and Saturday minimum-stay nights (UAE default).",
  },
  occTiers: {
    short: "occ tiers",
    label: "Occupancy tiers",
    description:
      "Price adjustments by portfolio occupancy band (e.g. 0–30%, 30–60%). Each tier can differ by days-out window.",
  },
  gradual: {
    short: "gradual",
    label: "Gradual discount",
    description: "Last-minute discount ramps smoothly across the window instead of jumping to max on day one.",
  },
  floorMult: {
    short: "Floor mult.",
    label: "Floor multiplier",
    description:
      "Org-wide guardrail: per-property floor is at least base rate × this value when market data is unavailable.",
  },
  ceilingMult: {
    short: "Ceiling mult.",
    label: "Ceiling multiplier",
    description:
      "Org-wide guardrail: per-property ceiling is at most base rate × this value when market data is unavailable.",
  },
  maxDailyChange: {
    short: "Max daily change",
    label: "Max daily price change",
    description: "Largest single-day rate move the engine may propose before flagging for review.",
  },
  autoApprove: {
    short: "Auto-approve",
    label: "Auto-approve threshold",
    description: "Proposals with a change smaller than this % can auto-approve when the org is in Active mode.",
  },
  lastMinute: {
    short: "Last-minute",
    label: "Last-minute discount",
    description: "Default max discount % applied to vacant nights inside the last-minute window at property level.",
  },
  farOut: {
    short: "Far-out",
    label: "Far-out markup",
    description: "Premium % added to rates booked far in advance, inside the far-out day window.",
  },
  weekendUplift: {
    short: "Weekend uplift",
    label: "Weekend uplift",
    description: "Extra % added on configured weekend nights (e.g. Fri/Sat in UAE).",
  },
  gapFill: {
    short: "Gap fill",
    label: "Gap-fill discount",
    description: "Discount on short orphan gaps between bookings to improve occupancy.",
  },
  strategyVsProfiles: {
    short: "Strategy vs profiles",
    label: "Strategy vs portfolio profiles",
    description:
      "Strategy sets org guardrails and property-level defaults (floor/ceiling envelope, LM/far-out caps). Portfolio Profiles hold seasonal matrices (occupancy tiers, MLOS packs, High/Low/Shoulder). Tweak strategy numbers here; edit seasonal detail in Portfolio Profiles above.",
  },
} as const;

export type PricingGlossaryKey = keyof typeof PRICING_GLOSSARY;
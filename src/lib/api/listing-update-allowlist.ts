/** Fields tenants may change via PUT/PATCH — never orgId, hostawayId, _id, etc. */
const LISTING_CLIENT_WRITABLE = new Set([
  "name",
  "area",
  "city",
  "countryCode",
  "address",
  "price",
  "validatedBasePrice",
  "priceFloor",
  "priceCeiling",
  "floorReasoning",
  "ceilingReasoning",
  "guardrailsSource",
  "currencyCode",
  "personCapacity",
  "amenities",
  "bedroomsNumber",
  "bathroomsNumber",
  "isActive",
  "lastMinuteEnabled",
  "lastMinuteDaysOut",
  "lastMinuteDiscountPct",
  "lastMinuteMinStay",
  "lastMinuteRampEnabled",
  "lastMinuteRampDays",
  "lastMinuteMaxDiscountPct",
  "lastMinuteMinDiscountPct",
  "occupancyEnabled",
  "occupancyLookbackDays",
  "occupancyMatrix",
  "occupancyPreset",
  "usePortfolioPricingDefaults",
  "pricingProfileOverrideId",
  "seasonalCalendarOverrideId",
  "minStayProfileOverrideId",
  "farOutEnabled",
  "farOutDaysOut",
  "farOutMarkupPct",
  "farOutMinStay",
  "dowPricingEnabled",
  "dowDays",
  "dowPriceAdjPct",
  "dowMinStay",
  "gapPreventionEnabled",
  "minFragmentThreshold",
  "gapFillEnabled",
  "gapFillLengthMin",
  "gapFillLengthMax",
  "gapFillDiscountPct",
  "gapFillOverrideCico",
  "allowedCheckinDays",
  "allowedCheckoutDays",
  "lowestMinStayAllowed",
  "defaultMaxStay",
]);

export function pickListingClientUpdates(
  body: Record<string, unknown>
): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (LISTING_CLIENT_WRITABLE.has(key)) {
      updates[key] = value;
    }
  }
  return updates;
}
export type RateLabel = "Listed Rate" | "Avg Rate";

export interface DisplayRateInput {
  /** Stale-safe fallback from Listing.price when calendar is empty. */
  listedPrice: number;
  calendarPrices?: number[];
  avgCalendarRate?: number | null;
  /** Today's synced calendar rate (preferred listed reference when rates vary). */
  calendarListedPrice?: number | null;
}

export interface DisplayRateResult {
  displayRate: number;
  rateLabel: RateLabel;
  listedPrice: number;
  avgCalendarRate: number | null;
}

/**
 * Choose an honest label for the rate chip in pricing / agent chat.
 * Listed Rate always comes from synced Hostaway calendar when available -
 * never from stale Listing.price alone.
 */
export function resolveDisplayRate({
  listedPrice,
  calendarPrices = [],
  avgCalendarRate = null,
  calendarListedPrice = null,
}: DisplayRateInput): DisplayRateResult {
  const positive = calendarPrices.filter((p) => p > 0);
  const unique = new Set(positive.map((p) => Math.round(p)));
  const hasVariedCalendarRates = unique.size > 1;
  const calendarFlatRate =
    !hasVariedCalendarRates && positive.length > 0 ? positive[0] : null;

  const computedAvg =
    avgCalendarRate != null && avgCalendarRate > 0
      ? Math.round(avgCalendarRate * 100) / 100
      : positive.length > 0
        ? Math.round((positive.reduce((s, p) => s + p, 0) / positive.length) * 100) / 100
        : null;

  const calendarListed =
    calendarListedPrice != null && calendarListedPrice > 0
      ? calendarListedPrice
      : calendarFlatRate;

  const resolvedListed =
    calendarListed != null && calendarListed > 0
      ? calendarListed
      : listedPrice > 0
        ? listedPrice
        : computedAvg ?? 0;

  if (hasVariedCalendarRates && computedAvg != null) {
    return {
      displayRate: computedAvg,
      rateLabel: "Avg Rate",
      listedPrice: resolvedListed,
      avgCalendarRate: computedAvg,
    };
  }

  return {
    displayRate: resolvedListed,
    rateLabel: "Listed Rate",
    listedPrice: resolvedListed,
    avgCalendarRate: computedAvg,
  };
}

export interface ListingPriceContext extends DisplayRateResult {
  /** Authoritative rate for UI + agent chat (synced calendar when available). */
  currentPrice: number;
  /** Raw Listing.price from Hostaway — may be a stale placeholder. */
  pmsBasePrice: number;
  pmsPriceTrusted: boolean;
  validatedBasePrice: number | null;
  pmsDiffersFromCalendar: boolean;
}

/**
 * Resolve the rate Aria should quote as "current price" — same logic as /api/properties.
 */
export function resolveListingPriceContext(input: {
  listingPrice: number;
  calendarPrices?: number[];
  avgCalendarRate?: number | null;
  calendarListedPrice?: number | null;
  validatedBasePrice?: number | null;
  pmsPriceTrusted?: boolean;
}): ListingPriceContext {
  const rate = resolveDisplayRate({
    listedPrice: input.listingPrice,
    calendarPrices: input.calendarPrices,
    avgCalendarRate: input.avgCalendarRate,
    calendarListedPrice: input.calendarListedPrice,
  });

  const pmsBasePrice = Math.max(0, Number(input.listingPrice) || 0);
  const calendarRate = rate.displayRate;
  const pmsDiffersFromCalendar =
    pmsBasePrice > 0 &&
    calendarRate > 0 &&
    Math.abs(pmsBasePrice - calendarRate) / calendarRate > 0.35;

  const pmsLooksLikePlaceholder =
    pmsBasePrice > 0 && calendarRate > 0 && pmsBasePrice >= calendarRate * 3;

  const pmsPriceTrusted =
    input.pmsPriceTrusted !== false &&
    !pmsDiffersFromCalendar &&
    !pmsLooksLikePlaceholder;

  const currentPrice =
    calendarRate > 0
      ? calendarRate
      : input.validatedBasePrice && input.validatedBasePrice > 0
        ? input.validatedBasePrice
        : pmsBasePrice;

  return {
    ...rate,
    currentPrice,
    pmsBasePrice,
    pmsPriceTrusted,
    validatedBasePrice: input.validatedBasePrice ?? null,
    pmsDiffersFromCalendar,
  };
}

/**
 * Hostaway often stores nonsense floor/ceiling derived from placeholder base prices
 * (e.g. base 9999 → floor 6999). Clamp to sensible multiples of the live calendar rate.
 */
export function sanitizeStaticGuardrails(
  priceFloor: number,
  priceCeiling: number,
  trustedListedPrice: number
): { floor: number; ceiling: number; sanitized: boolean } {
  const floor = Math.max(0, Number(priceFloor) || 0);
  const ceiling = Math.max(0, Number(priceCeiling) || 0);
  const listed = Math.max(0, Number(trustedListedPrice) || 0);

  if (listed <= 0) {
    return { floor, ceiling, sanitized: false };
  }

  let outFloor = floor;
  let outCeiling = ceiling;
  let sanitized = false;

  if (outFloor > listed * 2.5) {
    outFloor = Math.round(listed * 0.65);
    sanitized = true;
  }
  if (outCeiling > listed * 4) {
    outCeiling = Math.round(listed * 2.8);
    sanitized = true;
  }
  if (outCeiling > 0 && outCeiling <= outFloor) {
    outCeiling = Math.round(Math.max(outFloor + 1, listed * 2.5));
    sanitized = true;
  }
  if (outFloor <= 0 && outCeiling > 0) {
    outFloor = Math.round(listed * 0.65);
    sanitized = true;
  }
  if (outCeiling <= 0 && outFloor > 0) {
    outCeiling = Math.round(listed * 2.8);
    sanitized = true;
  }

  return { floor: outFloor, ceiling: outCeiling, sanitized };
}

/** Pick the value that matches the chip label shown in the UI. */
export function formatRateForLabel(
  rateLabel: RateLabel | string | undefined,
  fields: {
    listedPrice?: number | null;
    displayRate?: number | null;
    avgCalendarRate?: number | null;
    avgPrice?: number | null;
  }
): number {
  const listed = Number(fields.listedPrice ?? 0);
  const display = Number(fields.displayRate ?? 0);
  const avg = Number(fields.avgCalendarRate ?? fields.avgPrice ?? 0);

  if (rateLabel === "Avg Rate") {
    return display > 0 ? display : avg > 0 ? avg : listed;
  }
  return listed > 0 ? listed : display > 0 ? display : avg;
}
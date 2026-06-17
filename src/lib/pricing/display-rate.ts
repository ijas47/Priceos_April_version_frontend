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
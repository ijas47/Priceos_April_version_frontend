export type RateLabel = "Listed Rate" | "Avg Rate";

export interface DisplayRateInput {
  listedPrice: number;
  calendarPrices?: number[];
  avgCalendarRate?: number | null;
}

export interface DisplayRateResult {
  displayRate: number;
  rateLabel: RateLabel;
  listedPrice: number;
  avgCalendarRate: number | null;
}

/**
 * Choose an honest label for the rate chip in pricing / agent chat.
 * When every synced calendar day shows the same PMS base rate, call it Listed Rate.
 * Only use Avg Rate when nightly rates actually vary across the window.
 */
export function resolveDisplayRate({
  listedPrice,
  calendarPrices = [],
  avgCalendarRate = null,
}: DisplayRateInput): DisplayRateResult {
  const positive = calendarPrices.filter((p) => p > 0);
  const unique = new Set(positive.map((p) => Math.round(p)));
  const hasVariedCalendarRates = unique.size > 1;

  const computedAvg =
    avgCalendarRate != null && avgCalendarRate > 0
      ? Math.round(avgCalendarRate * 100) / 100
      : positive.length > 0
        ? Math.round((positive.reduce((s, p) => s + p, 0) / positive.length) * 100) / 100
        : null;

  if (hasVariedCalendarRates && computedAvg != null) {
    return {
      displayRate: computedAvg,
      rateLabel: "Avg Rate",
      listedPrice,
      avgCalendarRate: computedAvg,
    };
  }

  return {
    displayRate: listedPrice > 0 ? listedPrice : computedAvg ?? 0,
    rateLabel: "Listed Rate",
    listedPrice,
    avgCalendarRate: computedAvg,
  };
}
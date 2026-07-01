import { addDays, format, parseISO } from "date-fns";

export interface GapAnalysisDay {
  date: string;
  status?: string | null;
  min_stay?: number | null;
  current_price?: number | null;
}

export type GapType = "orphan" | "short_gap" | "extended_vacancy";

export interface GapAnalysisGap {
  date_from: string;
  date_to: string;
  nights: number;
  gap_type: GapType;
  min_stay: number;
  current_price: number;
  recommended_action: string;
  suggested_discount_pct: number | null;
}

export interface GapAnalysisLosRecommendation {
  period: string;
  current_min_stay: number;
  recommended_min_stay: number;
  reason: string;
}

export interface GapAnalysisResult {
  gaps: GapAnalysisGap[];
  los_recommendations: GapAnalysisLosRecommendation[];
  summary: string;
}

function isBookedDay(status: string | null | undefined): boolean {
  return status === "booked" || status === "pending" || status === "occupied";
}

function classifyGap(nights: number): GapType {
  if (nights === 1) return "orphan";
  if (nights <= 3) return "short_gap";
  return "extended_vacancy";
}

function recommendedAction(
  nights: number,
  minStay: number,
  gapType: GapType
): { action: string; discountPct: number | null } {
  if (gapType === "orphan") {
    return {
      action:
        minStay > 1
          ? "Reduce min stay to 1 night for orphan gap between bookings"
          : "Apply gap-fill discount if still unsold within 48h of arrival",
      discountPct: 16,
    };
  }
  if (gapType === "short_gap") {
    const targetMin = Math.min(2, nights);
    return {
      action:
        minStay > targetMin
          ? `Reduce min stay to ${targetMin} nights for ${nights}-night micro-gap`
          : "Light gap-fill discount if conversion is low",
      discountPct: 12,
    };
  }
  return {
    action: "Extended vacancy — review pricing and LOS; consider targeted promotion",
    discountPct: null,
  };
}

/**
 * Finds bookable gaps sandwiched between occupied nights (Property Analyst input).
 */
export function buildGapAnalysis(
  days: GapAnalysisDay[],
  options?: { gapFillDiscountPct?: number }
): GapAnalysisResult {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const gapFillPct = options?.gapFillDiscountPct ?? 15;
  const gaps: GapAnalysisGap[] = [];
  const losRecommendations: GapAnalysisLosRecommendation[] = [];

  const booked = sorted.map((d) => isBookedDay(d.status));
  const dates = sorted.map((d) => d.date);

  let i = 0;
  while (i < sorted.length) {
    if (booked[i] || sorted[i].status === "blocked") {
      i++;
      continue;
    }

    const gapStartIdx = i;
    const hasBookingBefore = gapStartIdx > 0 && booked[gapStartIdx - 1];

    while (i < sorted.length && !booked[i] && sorted[i].status !== "blocked") {
      i++;
    }

    const gapEndIdx = i - 1;
    const hasBookingAfter = i < sorted.length && booked[i];

    if (!hasBookingBefore || !hasBookingAfter) continue;

    const gapDays = sorted.slice(gapStartIdx, gapEndIdx + 1);
    const nights = gapDays.length;
    const gapType = classifyGap(nights);
    const minStay = Math.max(...gapDays.map((d) => d.min_stay ?? 1));
    const currentPrice = Math.round(
      gapDays.reduce((s, d) => s + Number(d.current_price ?? 0), 0) / nights
    );
    const { action, discountPct } = recommendedAction(nights, minStay, gapType);

    gaps.push({
      date_from: dates[gapStartIdx],
      date_to: dates[gapEndIdx],
      nights,
      gap_type: gapType,
      min_stay: minStay,
      current_price: currentPrice,
      recommended_action: action,
      suggested_discount_pct:
        discountPct != null ? Math.min(discountPct, gapFillPct) : null,
    });

    if (minStay > nights && gapType !== "extended_vacancy") {
      losRecommendations.push({
        period: `${format(parseISO(dates[gapStartIdx]), "MMM d")}–${format(parseISO(dates[gapEndIdx]), "MMM d")}`,
        current_min_stay: minStay,
        recommended_min_stay: gapType === "orphan" ? 1 : Math.min(2, nights),
        reason: `${nights}-night gap blocked by min_stay=${minStay}`,
      });
    }
  }

  const summary =
    gaps.length === 0
      ? "No orphan or micro-gaps between bookings in the analysis window."
      : `${gaps.length} gap${gaps.length === 1 ? "" : "s"} detected (${gaps.filter((g) => g.gap_type === "orphan").length} orphan, ${gaps.filter((g) => g.gap_type === "short_gap").length} short). Prefer LOS relaxation before discounting.`;

  return { gaps, los_recommendations: losRecommendations, summary };
}

/** Enumerate ISO dates inclusive (for tests). */
export function enumerateIsoDates(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = parseISO(from);
  const end = parseISO(to);
  while (cur <= end) {
    out.push(format(cur, "yyyy-MM-dd"));
    cur = addDays(cur, 1);
  }
  return out;
}
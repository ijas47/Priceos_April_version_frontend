import type { CrisisTier } from "@/lib/pricing/crisis-regime";
import { isDubaiMarket } from "@/lib/market/dubai-airroi";

export type DemandRegime = "distressed" | "soft" | "normal" | "strong";

export interface DemandRegimeInput {
  forwardOccupancy?: number | null;
  marketOccupancy?: number | null;
  portfolioOccupancyPct?: number | null;
  bookingPaceRatio?: number | null;
  crisisTier?: CrisisTier;
  month?: number;
  city?: string;
  countryCode?: string;
  listedPrice?: number | null;
  pacingAdr?: number | null;
}

export interface DemandRegimeResult {
  regime: DemandRegime;
  score: number;
  reasons: string[];
  /** Scale applied to market anchor output (1 = unchanged). */
  anchorScale: number;
  suspendCompFloorGuard: boolean;
  useStaticFloorOnly: boolean;
  /** In distressed mode, do not clamp price above listed × this factor. */
  maxFloorVsListedPct: number;
  narrativeGuidance: string;
}

function isGulfSummerTrough(month: number, city: string, countryCode: string): boolean {
  if (!isDubaiMarket(city, countryCode)) return month >= 6 && month <= 9;
  return month >= 6 && month <= 9;
}

/**
 * Classify current demand so pricing does not blindly chase historical p50/p25.
 */
export function resolveDemandRegime(input: DemandRegimeInput): DemandRegimeResult {
  const reasons: string[] = [];
  let score = 70;

  const fwdOcc = input.forwardOccupancy ?? null;
  const mktOcc = input.marketOccupancy ?? null;
  const portOcc = input.portfolioOccupancyPct ?? null;
  const pace = input.bookingPaceRatio ?? null;
  const crisis = input.crisisTier ?? 0;
  const month = input.month ?? new Date().getMonth() + 1;
  const city = input.city ?? "Dubai";
  const cc = input.countryCode ?? "AE";

  if (crisis >= 2) {
    score -= 25;
    reasons.push(`crisis_tier_${crisis}`);
  } else if (crisis === 1) {
    score -= 10;
    reasons.push("crisis_tier_1");
  }

  if (isGulfSummerTrough(month, city, cc)) {
    score -= 12;
    reasons.push("gulf_summer_trough");
  }

  if (fwdOcc != null) {
    if (fwdOcc < 0.2) {
      score -= 22;
      reasons.push(`forward_occ_${Math.round(fwdOcc * 100)}pct`);
    } else if (fwdOcc < 0.35) {
      score -= 12;
      reasons.push(`forward_occ_${Math.round(fwdOcc * 100)}pct`);
    } else if (fwdOcc >= 0.75) {
      score += 10;
      reasons.push(`forward_occ_${Math.round(fwdOcc * 100)}pct`);
    }
  }

  if (mktOcc != null && mktOcc < 0.35) {
    score -= 8;
    reasons.push(`market_occ_${Math.round(mktOcc * 100)}pct`);
  }

  if (portOcc != null) {
    if (portOcc <= 5) {
      score -= 18;
      reasons.push("portfolio_occ_near_zero");
    } else if (portOcc < 25) {
      score -= 10;
      reasons.push(`portfolio_occ_${portOcc}pct`);
    } else if (portOcc >= 75) {
      score += 8;
    }
  }

  if (pace != null) {
    if (pace < 0.45) {
      score -= 20;
      reasons.push(`pace_${Math.round(pace * 100)}pct_stly`);
    } else if (pace < 0.7) {
      score -= 10;
      reasons.push(`pace_${Math.round(pace * 100)}pct_stly`);
    } else if (pace > 1.2) {
      score += 8;
      reasons.push(`pace_${Math.round(pace * 100)}pct_stly`);
    }
  }

  score = Math.max(0, Math.min(100, score));

  let regime: DemandRegime = "normal";
  if (score < 38) regime = "distressed";
  else if (score < 55) regime = "soft";
  else if (score >= 78) regime = "strong";

  const anchorScale =
    regime === "distressed" ? 0.42 : regime === "soft" ? 0.72 : regime === "strong" ? 1.06 : 1;

  const suspendCompFloorGuard = regime === "distressed" || regime === "soft";
  const useStaticFloorOnly = regime === "distressed";
  const maxFloorVsListedPct = regime === "distressed" ? 1.12 : regime === "soft" ? 1.25 : 2;

  const narrativeGuidance =
    regime === "distressed"
      ? "DISTRESSED DEMAND: Historical benchmark p50/p25 are NOT current clearing prices. Do NOT recommend raising rates to market median or static floor. Prioritize occupancy and RevPAR; low ADR with bookings beats high ADR with zero bookings. Treat listed price as defensible unless engine proposals say otherwise."
      : regime === "soft"
        ? "SOFT DEMAND: Use forward pacing and portfolio pickup over static seasonal medians. Avoid aggressive floor lifts toward comp p25."
        : regime === "strong"
          ? "STRONG DEMAND: Market anchors and floor guardrails apply; test modest premiums on high-intent dates."
          : "NORMAL DEMAND: Blend market anchors with pacing and portfolio performance.";

  return {
    regime,
    score,
    reasons,
    anchorScale,
    suspendCompFloorGuard,
    useStaticFloorOnly,
    maxFloorVsListedPct,
    narrativeGuidance,
  };
}

export function resolveDistressedEffectiveFloor(args: {
  staticFloor: number;
  listedPrice: number;
  pacingAdr?: number | null;
  regime: DemandRegimeResult;
}): number {
  const listed = Math.max(0, args.listedPrice);
  if (args.regime.regime !== "distressed" && args.regime.regime !== "soft") {
    return args.staticFloor;
  }

  const pacingCap =
    args.pacingAdr && args.pacingAdr > 0
      ? Math.round(args.pacingAdr * (args.regime.regime === "distressed" ? 0.92 : 0.98))
      : null;

  const listedCap = listed > 0 ? Math.round(listed * args.regime.maxFloorVsListedPct) : null;

  const candidates = [args.staticFloor];
  if (pacingCap) candidates.push(pacingCap);
  if (listedCap) candidates.push(listedCap);

  return Math.min(...candidates.filter((v) => v > 0));
}

export function adjustBenchmarkVerdictForRegime(
  verdict: string | null | undefined,
  regime: DemandRegime,
  portfolioOccupancyPct?: number | null
): string {
  if (regime === "distressed" || (regime === "soft" && (portfolioOccupancyPct ?? 100) < 20)) {
    return "DEFENSIVE_HOLD";
  }
  return verdict || "FAIR";
}
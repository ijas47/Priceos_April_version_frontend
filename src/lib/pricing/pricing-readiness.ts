import type { ListingPriceContext } from "@/lib/pricing/display-rate";
import { isFlatCalendar, isRoundPlaceholderPrice } from "@/lib/pricing/listing-price-sanity";

export type PricingReadinessLevel = "ready" | "advisory" | "blocked";

export interface PricingReadinessIssue {
  code: string;
  severity: "block" | "warn";
  title: string;
  message: string;
  userAction: string;
}

export interface PricingReadinessResult {
  level: PricingReadinessLevel;
  canGenerateProposals: boolean;
  canRecommendPrices: boolean;
  trustedListedPrice: number | null;
  issues: PricingReadinessIssue[];
  summary: string;
}

export interface AssessPricingReadinessInput {
  hostawayId?: string | null;
  name?: string;
  price: number;
  priceFloor: number;
  priceCeiling: number;
  isActive?: boolean;
  priceContext: ListingPriceContext;
  calendarPrices: number[];
  /** At least one benchmark row or live market signal for this listing. */
  hasMarketBenchmark?: boolean;
  guardrailsWereSanitized?: boolean;
  minCalendarDays?: number;
}

const DEFAULT_MIN_CALENDAR_DAYS = 14;

function issue(
  code: string,
  severity: "block" | "warn",
  title: string,
  message: string,
  userAction: string
): PricingReadinessIssue {
  return { code, severity, title, message, userAction };
}

export function isDemoOrTestHostawayId(hostawayId?: string | null): boolean {
  const hid = String(hostawayId ?? "").trim();
  return /^demo[-_]/i.test(hid);
}

export function isDummyListingName(name?: string | null): boolean {
  const n = (name ?? "").toLowerCase();
  return /\b(test listing|dummy|placeholder unit|sample property)\b/.test(n);
}

/**
 * Hard gate before the engine or Aria quote prices.
 * Block = no proposals / no numeric recommendations. Advisory = caveat only.
 */
export function assessPricingReadiness(
  input: AssessPricingReadinessInput
): PricingReadinessResult {
  const issues: PricingReadinessIssue[] = [];
  const minDays = input.minCalendarDays ?? DEFAULT_MIN_CALENDAR_DAYS;
  const positive = input.calendarPrices.filter((p) => p > 0);
  const trusted = input.priceContext.currentPrice;
  const hostawayId = String(input.hostawayId ?? "").trim();

  if (input.isActive === false) {
    issues.push(
      issue(
        "INACTIVE_LISTING",
        "block",
        "Listing inactive",
        "This unit is marked inactive in PriceOS.",
        "Activate the listing after PMS data is verified, or hide it from pricing."
      )
    );
  }

  if (isDemoOrTestHostawayId(hostawayId)) {
    issues.push(
      issue(
        "DEMO_UNIT",
        "block",
        "Demo / test unit",
        "Hostaway ID indicates a demo or pilot placeholder — not a live bookable unit.",
        "Connect the production Hostaway listing ID before running pricing."
      )
    );
  }

  if (isDummyListingName(input.name)) {
    issues.push(
      issue(
        "DUMMY_NAME",
        "block",
        "Dummy listing name",
        "Listing name looks like a test or placeholder property.",
        "Rename or remove test units; connect real inventory from Hostaway."
      )
    );
  }

  if (!hostawayId && positive.length < minDays) {
    issues.push(
      issue(
        "UNCONNECTED_PMS",
        "block",
        "Not connected to PMS",
        "No Hostaway listing ID and fewer than 14 days of synced calendar rates.",
        "Connect Hostaway and sync calendar before generating proposals."
      )
    );
  }

  if (positive.length === 0) {
    issues.push(
      issue(
        "NO_CALENDAR_RATES",
        "block",
        "No calendar rates",
        "No nightly rates found in the synced calendar for this unit.",
        "Sync Hostaway calendar (Pricing → Run engine) or check API credentials."
      )
    );
  } else if (positive.length < minDays) {
    issues.push(
      issue(
        "LOW_CALENDAR_COVERAGE",
        "warn",
        "Limited calendar coverage",
        `Only ${positive.length} days with rates (need ${minDays}+ for reliable proposals).`,
        "Sync a full forward calendar from Hostaway (at least 30 days)."
      )
    );
  }

  if (trusted <= 0) {
    issues.push(
      issue(
        "NO_TRUSTED_LISTED_PRICE",
        "block",
        "No trusted listed price",
        "Cannot determine a live nightly rate from calendar or validated base price.",
        "Ensure Hostaway calendar has nightly rates, or set a validated base in pricing settings."
      )
    );
  }

  if (!input.priceContext.pmsPriceTrusted) {
    if (positive.length === 0 || trusted <= 0) {
      issues.push(
        issue(
          "PMS_PRICE_UNTRUSTED",
          "block",
          "PMS price unreliable",
          `Hostaway base price (${input.priceContext.pmsBasePrice}) is not trustworthy and calendar is insufficient.`,
          "Fix listing base price in Hostaway and re-sync calendar."
        )
      );
    } else {
      issues.push(
        issue(
          "PMS_METADATA_STALE",
          "warn",
          "Stale PMS base price",
          `Hostaway listing price (${input.priceContext.pmsBasePrice}) differs from synced calendar (~${trusted}). Engine uses calendar.`,
          "Align Hostaway base price with live calendar to avoid confusion in reports."
        )
      );
    }
  }

  const flatPlaceholder =
    positive.length > 0 &&
    isFlatCalendar(positive) &&
    isRoundPlaceholderPrice(Math.round(positive[0]));

  if (flatPlaceholder && !input.hasMarketBenchmark) {
    issues.push(
      issue(
        "FLAT_PLACEHOLDER_CALENDAR",
        "block",
        "Flat placeholder calendar",
        `All synced nights show the same round rate (${positive[0]}) with no market benchmark to validate it.`,
        "Set real per-night rates in Hostaway or wait for market intel bootstrap."
      )
    );
  } else if (flatPlaceholder) {
    issues.push(
      issue(
        "FLAT_CALENDAR",
        "warn",
        "Flat calendar rates",
        `Every synced night is ${positive[0]} — may be a default, not dynamic pricing.`,
        "Confirm rates in Hostaway; flat placeholders often mean the unit was not fully configured."
      )
    );
  }

  if (input.guardrailsWereSanitized) {
    issues.push(
      issue(
        "GUARDRAILS_SANITIZED",
        "warn",
        "Floor/ceiling corrected",
        `PMS floor/ceiling (${input.priceFloor}/${input.priceCeiling}) were clamped to match live calendar scale.`,
        "Update floor and ceiling in Hostaway to realistic values for this unit type."
      )
    );
  }

  if (trusted > 0 && input.priceFloor > trusted * 2.5) {
    issues.push(
      issue(
        "ABSURD_PMS_FLOOR",
        "warn",
        "PMS floor too high",
        `Price floor (${input.priceFloor}) is far above the live calendar rate (~${trusted}).`,
        "Lower priceFloor in Hostaway — high floors cause unrealistic proposal bands."
      )
    );
  }

  if (!input.hasMarketBenchmark && positive.length >= minDays && trusted > 0) {
    issues.push(
      issue(
        "NO_MARKET_BENCHMARK",
        "warn",
        "No market benchmark",
        "Calendar looks usable but comp-set / market benchmark is missing for this unit.",
        "Run market bootstrap or wait for benchmark refresh before trusting aggressive moves."
      )
    );
  }

  const hasBlock = issues.some((i) => i.severity === "block");
  const hasWarn = issues.some((i) => i.severity === "warn");
  const level: PricingReadinessLevel = hasBlock ? "blocked" : hasWarn ? "advisory" : "ready";

  const blockTitles = issues.filter((i) => i.severity === "block").map((i) => i.title);
  const warnTitles = issues.filter((i) => i.severity === "warn").map((i) => i.title);

  let summary: string;
  if (hasBlock) {
    summary = `Pricing blocked: ${blockTitles.join("; ")}`;
  } else if (hasWarn) {
    summary = `Pricing advisory: ${warnTitles.join("; ")}`;
  } else {
    summary = "Listing data validated — safe to generate proposals.";
  }

  return {
    level,
    canGenerateProposals: !hasBlock,
    canRecommendPrices: !hasBlock,
    trustedListedPrice: trusted > 0 ? trusted : null,
    issues,
    summary,
  };
}

/** Agent + API friendly payload */
export function pricingReadinessForAgent(result: PricingReadinessResult) {
  return {
    level: result.level,
    can_generate_proposals: result.canGenerateProposals,
    can_recommend_prices: result.canRecommendPrices,
    trusted_listed_price: result.trustedListedPrice,
    summary: result.summary,
    issues: result.issues.map((i) => ({
      code: i.code,
      severity: i.severity,
      title: i.title,
      message: i.message,
      user_action: i.userAction,
    })),
    agent_instruction:
      result.level === "blocked"
        ? "DO NOT quote recommended prices or propose rate changes. Flag each issue and tell the user exactly what to fix in Hostaway/PriceOS before pricing can run."
        : result.level === "advisory"
          ? "Caveat all price guidance with listed issues. Prefer engine_proposals over invented numbers."
          : "Safe to use engine_proposals and trusted_listed_price for recommendations.",
  };
}
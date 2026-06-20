import { resolveMarketAnchorBase } from "@/lib/pricing/market-anchor";
import type { DemandRegime } from "@/lib/pricing/demand-regime";
import { resolvePaceDemandMultiplier } from "@/lib/pricing/booking-pace";
import { resolveBookingRecencyDiscountPct } from "@/lib/pricing/booking-recency";
import {
    applyCrisisAdjustment,
    type CrisisTier,
} from "@/lib/pricing/crisis-regime";
import type { BookingRecencyConfig } from "@/lib/pricing/types";

/**
 * 4-pass pricing waterfall.
 *
 * Produces a 7-parameter vector for a single calendar day:
 *   price, minimum_stay, maximum_stay, is_available,
 *   closed_to_arrival, closed_to_departure, note
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ListingConfig {
    basePrice: number;
    absoluteMinPrice: number;
    absoluteMaxPrice: number;
    defaultMinStay: number;
    defaultMaxStay: number;
    lowestMinStayAllowed: number;
    allowedCheckinDays: number[]; // [Mon..Sun] 0/1
    allowedCheckoutDays: number[]; // [Mon..Sun] 0/1

    lastMinuteEnabled: boolean;
    lastMinuteDaysOut: number;
    lastMinuteDiscountPct: number;
    lastMinuteMinStay: number | null;
    lastMinuteRampEnabled?: boolean;
    lastMinuteRampDays?: number;
    lastMinuteMaxDiscountPct?: number;
    lastMinuteMinDiscountPct?: number;

    occupancyEnabled?: boolean;
    occupancyMatrix?: {
        dayRanges: { startDay: number; endDay: number }[];
        rows: { maxOccupancyPct: number; adjustmentsPct: number[] }[];
    };
    occupancyPct?: number;

    farOutEnabled: boolean;
    farOutDaysOut: number;
    farOutMarkupPct: number;
    farOutMinStay: number | null;

    dowPricingEnabled: boolean;
    dowDays: number[]; // e.g. [5,6] - 0=Mon..6=Sun
    dowPriceAdjPct: number;
    dowMinStay: number | null;

    gapPreventionEnabled: boolean;
    minFragmentThreshold: number;

    gapFillEnabled: boolean;
    gapFillLengthMin: number;
    gapFillLengthMax: number;
    gapFillDiscountPct: number;
    gapFillOverrideCico: boolean;

    /** Portfolio booking-recency discount (PriceLabs account level). */
    bookingRecency?: BookingRecencyConfig | null;
    daysSinceLastBooking?: number | null;
    /** Active geopolitical crisis tier for this run (0 = normal). */
    crisisTier?: CrisisTier;
    /** Demand regime from forward occ / pace / crisis signals. */
    demandRegime?: DemandRegime;
    /** Scales market anchor toward listed price when demand is weak. */
    demandAnchorScale?: number;
    /** Do not clamp above listed × factor in distressed mode. */
    demandMaxFloorVsListedPct?: number;
}

export interface Rule {
    id: string | number;
    ruleType: "SEASON" | "EVENT" | "ADMIN_BLOCK" | "LOS_DISCOUNT";
    name: string;
    enabled: boolean;
    priority: number;
    startDate: string | null;
    endDate: string | null;
    daysOfWeek: number[] | null;
    minNights: number | null;
    priceOverride: number | null;
    priceAdjPct: number | null;
    minPriceOverride: number | null;
    maxPriceOverride: number | null;
    minStayOverride: number | null;
    isBlocked: boolean;
    closedToArrival: boolean;
    closedToDeparture: boolean;
    suspendLastMinute: boolean;
    suspendGapFill: boolean;
}

export interface BookingContext {
    isBooked: boolean;
    gapLength: number | null; // length of gap this day is part of, null if not in a gap
    gapStart: string | null;
    gapEnd: string | null;
}

/**
 * Per-date market signal derived from Airbtics or other comp-set sources.
 * All fields optional - if not provided, the Market Anchor pass is a no-op.
 */
export interface MarketSignal {
    /** Comp-set median ADR (Airbtics bounds or benchmark comps) */
    compSetP50?: number;
    compSetP25?: number;
    compSetP75?: number;
    /** Market p50 ADR for this date's month (anchor) */
    monthAnchorAdr?: number;
    /** Annual p50 ADR for the property's market */
    annualAnchorAdr?: number;
    /** Forward occupancy (0..1) for this date - drives demand multiplier */
    forwardOccupancy?: number;
    /** Market ADR for this exact date from future-pacing */
    pacingAdr?: number;
    /** Trailing market occupancy from Airbtics summary (0..1) */
    marketOccupancy?: number;
    /** Active listings in market (supply proxy) */
    activeListings?: number;
    /** Oversupply pressure 0..1 derived from market occupancy (higher = softer market) */
    supplyPressure?: number;
    /** Where comp-set p50 was sourced (for reasoning notes) */
    compSetSource?: string;
    /** Booking pace vs STLY for this lead-time horizon (1.0 = on pace). */
    bookingPaceRatio?: number;
}

/** Blend weight toward Airbtics forward pacing ADR for a single day. */
export const PACING_ADR_BLEND = 0.25;

export interface DayResult {
    price: number;
    minimumStay: number;
    maximumStay: number;
    isAvailable: number; // 0 or 1
    closedToArrival: number; // 0 or 1
    closedToDeparture: number; // 0 or 1
    note: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Convert a Date to 0=Mon..6=Sun index */
function getDow(date: Date): number {
    // JS getDay() returns 0=Sun..6=Sat
    // We need 0=Mon..6=Sun
    const jsDay = date.getDay();
    return jsDay === 0 ? 6 : jsDay - 1;
}

function daysBetween(a: Date, b: Date): number {
    return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function dateStr(d: Date): string {
    return d.toISOString().split("T")[0];
}

// ── Main Function ──────────────────────────────────────────────────────────────

export function computeDay(
    date: Date,
    today: Date,
    config: ListingConfig,
    allRules: Rule[],
    bookingCtx: BookingContext,
    marketSignal?: MarketSignal
): DayResult {
    const notes: string[] = [];
    const dow = getDow(date);
    const leadTime = daysBetween(today, date);

    // ── Pass 0 - Market Anchor (comp-set + pacing; listed price = reference only) ─
    const listedReference = config.basePrice;
    const anchor = resolveMarketAnchorBase(listedReference, marketSignal, {
      anchorScale: config.demandAnchorScale ?? 1,
    });
    let basePrice = anchor.price;
    notes.push(...anchor.notes);

    if (marketSignal) {
        // Demand: forward occupancy → surge / discount
        if (
            typeof marketSignal.forwardOccupancy === "number" &&
            marketSignal.forwardOccupancy > 0
        ) {
            const occ = marketSignal.forwardOccupancy;
            let demandMult = 1.0;
            if (occ >= 0.90) demandMult = 1.25;
            else if (occ >= 0.75) demandMult = 1.12;
            else if (occ >= 0.60) demandMult = 1.05;
            else if (occ < 0.30) demandMult = 0.88;
            else if (occ < 0.45) demandMult = 0.95;

            if (demandMult !== 1.0) {
                const before = basePrice;
                basePrice = basePrice * demandMult;
                notes.push(
                    `[MARKET] Demand ${(demandMult * 100 - 100).toFixed(0)}% (fwd occ ${(occ * 100).toFixed(0)}%) → ${before.toFixed(0)}→${basePrice.toFixed(0)}`
                );
            }
        }

        // Supply: soft market (high supply pressure) + weak forward pacing → extra discount
        const supplyPressure = marketSignal.supplyPressure;
        const fwdOcc = marketSignal.forwardOccupancy;
        if (
            typeof supplyPressure === "number" &&
            supplyPressure >= 0.45 &&
            typeof fwdOcc === "number" &&
            fwdOcc > 0 &&
            fwdOcc < 0.55
        ) {
            const supplyMult = fwdOcc < 0.35 ? 0.93 : 0.96;
            const before = basePrice;
            basePrice = basePrice * supplyMult;
            const supplyNote =
                marketSignal.activeListings != null
                    ? `supply ${marketSignal.activeListings.toLocaleString("en-US")} listings`
                    : `mkt occ ${((marketSignal.marketOccupancy ?? 0) * 100).toFixed(0)}%`;
            notes.push(
                `[MARKET] Supply ${(supplyMult * 100 - 100).toFixed(0)}% (${supplyNote}, fwd ${(fwdOcc * 100).toFixed(0)}%) → ${before.toFixed(0)}→${basePrice.toFixed(0)}`
            );
        }

        // Pacing is included in the weighted anchor blend - no second blend here.

        // Booking pace vs STLY (nights-on-books pickup)
        if (typeof marketSignal.bookingPaceRatio === "number") {
            const pace = resolvePaceDemandMultiplier(marketSignal.bookingPaceRatio);
            if (pace.multiplier !== 1 && pace.note) {
                const before = basePrice;
                basePrice = basePrice * pace.multiplier;
                notes.push(`${pace.note} → ${before.toFixed(0)}→${basePrice.toFixed(0)}`);
            }
        }
    }

    // ── Pass 1 - Foundation ────────────────────────────────────────────────────

    let price = basePrice;
    let minimumStay = config.defaultMinStay;
    let maximumStay = config.defaultMaxStay;
    let isAvailable = bookingCtx.isBooked ? 0 : 1;
    let closedToArrival = config.allowedCheckinDays[dow] === 0 ? 1 : 0;
    let closedToDeparture = config.allowedCheckoutDays[dow] === 0 ? 1 : 0;

    if (closedToArrival) notes.push("[BASE] Closed to arrival (DOW restriction)");
    if (closedToDeparture)
        notes.push("[BASE] Closed to departure (DOW restriction)");

    // Track suspensions from winning rule
    let suspendLastMinute = false;
    let suspendGapFill = false;

    // Rule-level min/max price overrides (from winning rule)
    let ruleMinPrice: number | null = null;
    let ruleMaxPrice: number | null = null;

    // Find matching date-override rules (SEASON, EVENT, ADMIN_BLOCK)
    const dateRules = allRules
        .filter((r) => {
            if (!r.enabled) return false;
            if (!["SEASON", "EVENT", "ADMIN_BLOCK"].includes(r.ruleType))
                return false;
            if (!r.startDate || !r.endDate) return false;
            const ds = dateStr(date);
            if (ds < r.startDate || ds > r.endDate) return false;
            // DOW filter within date range
            if (r.daysOfWeek && r.daysOfWeek.length > 0) {
                if (r.daysOfWeek[dow] === 0) return false;
            }
            return true;
        })
        .sort((a, b) => b.priority - a.priority);

    // Apply highest priority match
    if (dateRules.length > 0) {
        const winner = dateRules[0];

        if (winner.priceOverride !== null) {
            price = winner.priceOverride;
            notes.push(
                `[${winner.ruleType}] "${winner.name}" set price to ${price}`
            );
        } else if (winner.priceAdjPct !== null) {
            price = price * (1 + winner.priceAdjPct / 100);
            notes.push(
                `[${winner.ruleType}] "${winner.name}" adjusted price by ${winner.priceAdjPct}%`
            );
        }

        if (winner.minStayOverride !== null) {
            minimumStay = winner.minStayOverride;
            notes.push(
                `[${winner.ruleType}] "${winner.name}" set min stay to ${minimumStay}`
            );
        }

        if (winner.isBlocked) {
            isAvailable = 0;
            notes.push(`[${winner.ruleType}] "${winner.name}" blocked this day`);
        }

        if (winner.closedToArrival) {
            closedToArrival = 1;
            notes.push(
                `[${winner.ruleType}] "${winner.name}" closed to arrival`
            );
        }

        if (winner.closedToDeparture) {
            closedToDeparture = 1;
            notes.push(
                `[${winner.ruleType}] "${winner.name}" closed to departure`
            );
        }

        suspendLastMinute = winner.suspendLastMinute;
        suspendGapFill = winner.suspendGapFill;
        ruleMinPrice = winner.minPriceOverride;
        ruleMaxPrice = winner.maxPriceOverride;
    }

    // If booked, mark unavailable
    if (bookingCtx.isBooked) {
        isAvailable = 0;
        notes.push("[BOOKED] Day is booked");
    }

    // ── Pass 2 - Strategy ─────────────────────────────────────────────────────

    // Last-minute discount (gradual ramp: max at day 0 → min at rampDays)
    if (
        config.lastMinuteEnabled &&
        !suspendLastMinute &&
        leadTime <= config.lastMinuteDaysOut &&
        leadTime >= 0 &&
        isAvailable === 1
    ) {
        let discountPct = config.lastMinuteDiscountPct;
        if (config.lastMinuteRampEnabled) {
            const rampDays = config.lastMinuteRampDays ?? config.lastMinuteDaysOut;
            const maxD = config.lastMinuteMaxDiscountPct ?? config.lastMinuteDiscountPct;
            const minD = config.lastMinuteMinDiscountPct ?? 0;
            const t = rampDays > 0 ? Math.min(1, leadTime / rampDays) : 1;
            discountPct = maxD + (minD - maxD) * t;
        }
        price = price * (1 - discountPct / 100);
        notes.push(
            `[LAST_MINUTE] ${discountPct.toFixed(1)}% discount (${leadTime} days out${config.lastMinuteRampEnabled ? ", gradual" : ""})`
        );
        if (config.lastMinuteMinStay !== null) {
            minimumStay = config.lastMinuteMinStay;
            notes.push(`[LAST_MINUTE] min stay override to ${minimumStay}`);
        }
    }

    // Booking recency: extra discount when portfolio has gone quiet
    if (isAvailable === 1) {
        const recencyDiscount = resolveBookingRecencyDiscountPct(
            config.bookingRecency,
            config.daysSinceLastBooking ?? null,
            leadTime
        );
        if (recencyDiscount !== null && recencyDiscount > 0) {
            const before = price;
            price = price * (1 - recencyDiscount / 100);
            const daysLabel =
                config.daysSinceLastBooking != null
                    ? `${config.daysSinceLastBooking}d since last booking`
                    : "no booking history";
            notes.push(
                `[BOOKING_RECENCY] ${recencyDiscount}% discount (${daysLabel}, ${leadTime}d out) → ${before.toFixed(0)}→${price.toFixed(0)}`
            );
        }
    }

    // Occupancy × lead-time matrix (PriceLabs-style)
    if (
        config.occupancyEnabled &&
        config.occupancyMatrix &&
        typeof config.occupancyPct === "number" &&
        isAvailable === 1
    ) {
        const occ = config.occupancyPct;
        let colIdx = -1;
        for (let i = 0; i < config.occupancyMatrix.dayRanges.length; i++) {
            const r = config.occupancyMatrix.dayRanges[i];
            if (leadTime >= r.startDay && leadTime <= r.endDay) {
                colIdx = i;
                break;
            }
        }
        if (colIdx >= 0) {
            const sorted = [...config.occupancyMatrix.rows].sort(
                (a, b) => a.maxOccupancyPct - b.maxOccupancyPct
            );
            let adjPct = 0;
            for (const row of sorted) {
                if (occ <= row.maxOccupancyPct) {
                    adjPct = row.adjustmentsPct[colIdx] ?? 0;
                    break;
                }
            }
            if (adjPct !== 0) {
                price = price * (1 + adjPct / 100);
                notes.push(
                    `[OCCUPANCY] ${adjPct > 0 ? "+" : ""}${adjPct}% (occ ${occ}%, lead ${leadTime}d)`
                );
            }
        }
    }

    // Far-out premium
    if (
        config.farOutEnabled &&
        !suspendLastMinute && // spec says "if NOT suspended" for both
        leadTime >= config.farOutDaysOut &&
        isAvailable === 1
    ) {
        price = price * (1 + config.farOutMarkupPct / 100);
        notes.push(
            `[FAR_OUT] ${config.farOutMarkupPct}% premium (${leadTime} days out)`
        );
        if (config.farOutMinStay !== null) {
            minimumStay = config.farOutMinStay;
            notes.push(`[FAR_OUT] min stay override to ${minimumStay}`);
        }
    }

    // DOW pricing
    if (
        config.dowPricingEnabled &&
        config.dowDays.includes(dow) &&
        isAvailable === 1
    ) {
        price = price * (1 + config.dowPriceAdjPct / 100);
        notes.push(`[DOW] ${config.dowPriceAdjPct}% adjustment for day ${dow}`);
        if (config.dowMinStay !== null) {
            minimumStay = config.dowMinStay;
            notes.push(`[DOW] min stay override to ${minimumStay}`);
        }
    }

    // LOS discounts
    const losRules = allRules
        .filter(
            (r) =>
                r.enabled &&
                r.ruleType === "LOS_DISCOUNT" &&
                r.minNights !== null
        )
        .sort((a, b) => (b.minNights ?? 0) - (a.minNights ?? 0));

    if (losRules.length > 0) {
        // Store LOS discount info in note for reference; actual LOS discount
        // is applied at booking time, but we note available discounts
        const losNotes = losRules.map(
            (r) => `${r.minNights}+ nights: ${r.priceAdjPct}%`
        );
        notes.push(`[LOS_DISCOUNT] Available: ${losNotes.join(", ")}`);
    }

    // ── Pass 3 - Inventory (Gap Logic) ────────────────────────────────────────

    if (
        bookingCtx.gapLength !== null &&
        !bookingCtx.isBooked &&
        isAvailable === 1
    ) {
        // Gap prevention: if fragment is too small, block it
        if (
            config.gapPreventionEnabled &&
            bookingCtx.gapLength < config.minFragmentThreshold
        ) {
            isAvailable = 0;
            notes.push(
                `[GAP_PREVENTION] Gap of ${bookingCtx.gapLength} days < threshold ${config.minFragmentThreshold}, blocked`
            );
        }

        // Gap fill: if gap is in target range, discount and adjust
        if (
            config.gapFillEnabled &&
            !suspendGapFill &&
            isAvailable === 1 &&
            bookingCtx.gapLength >= config.gapFillLengthMin &&
            bookingCtx.gapLength <= config.gapFillLengthMax
        ) {
            price = price * (1 - config.gapFillDiscountPct / 100);
            minimumStay = bookingCtx.gapLength;
            notes.push(
                `[GAP_FILL] ${config.gapFillDiscountPct}% discount, min stay set to gap length ${bookingCtx.gapLength}`
            );

            if (config.gapFillOverrideCico) {
                closedToArrival = 0;
                closedToDeparture = 0;
                notes.push(`[GAP_FILL] CICO restrictions overridden`);
            }
        }
    }

    // ── Crisis regime (after inventory, before integrity clamps) ─────────────

    const crisisTier = config.crisisTier ?? 0;
    if (crisisTier > 0 && isAvailable === 1 && price > 0) {
        const crisisResult = applyCrisisAdjustment(price, crisisTier, {
            listedReference,
            compSetP25: marketSignal?.compSetP25,
            compSetP50: marketSignal?.compSetP50,
        });
        if (crisisResult.note) {
            const before = price;
            price = crisisResult.price;
            notes.push(`${crisisResult.note} → ${before.toFixed(0)}→${price.toFixed(0)}`);
        }
    }

    // ── Pass 4 - Integrity ────────────────────────────────────────────────────

    let effectiveMinPrice = ruleMinPrice ?? config.absoluteMinPrice;
    const effectiveMaxPrice = ruleMaxPrice ?? config.absoluteMaxPrice;

    if (
      config.demandRegime === "distressed" &&
      listedReference > 0 &&
      config.demandMaxFloorVsListedPct
    ) {
      effectiveMinPrice = Math.min(
        effectiveMinPrice,
        Math.round(listedReference * config.demandMaxFloorVsListedPct)
      );
    }

    if (price < effectiveMinPrice) {
        notes.push(
            `[CLAMP] Price ${price.toFixed(2)} clamped to min ${effectiveMinPrice}`
        );
        price = effectiveMinPrice;
    }
    if (price > effectiveMaxPrice) {
        notes.push(
            `[CLAMP] Price ${price.toFixed(2)} clamped to max ${effectiveMaxPrice}`
        );
        price = effectiveMaxPrice;
    }

    if (minimumStay < config.lowestMinStayAllowed) {
        notes.push(
            `[CLAMP] Min stay ${minimumStay} clamped to lowest allowed ${config.lowestMinStayAllowed}`
        );
        minimumStay = config.lowestMinStayAllowed;
    }

    // Round price to 2 decimal places
    price = Math.round(price * 100) / 100;

    return {
        price,
        minimumStay,
        maximumStay,
        isAvailable,
        closedToArrival,
        closedToDeparture,
        note: notes.join("; "),
    };
}

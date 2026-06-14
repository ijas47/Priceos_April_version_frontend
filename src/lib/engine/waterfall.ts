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

    farOutEnabled: boolean;
    farOutDaysOut: number;
    farOutMarkupPct: number;
    farOutMinStay: number | null;

    dowPricingEnabled: boolean;
    dowDays: number[]; // e.g. [5,6] — 0=Mon..6=Sun
    dowPriceAdjPct: number;
    dowMinStay: number | null;

    gapPreventionEnabled: boolean;
    minFragmentThreshold: number;

    gapFillEnabled: boolean;
    gapFillLengthMin: number;
    gapFillLengthMax: number;
    gapFillDiscountPct: number;
    gapFillOverrideCico: boolean;
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
    /**
     * Nights until the next booking starts, counting from this day. Used for
     * PROACTIVE orphan prevention: if a booking is only a few nights away, a
     * short stay starting here would strand an un-bookable remnant, so we raise
     * minStay to reach the booking. null = no booking within the look-ahead.
     */
    daysUntilNextBooking?: number | null;
}

/**
 * Per-date market signal derived from Airbtics or other comp-set sources.
 * All fields optional — if not provided, the Market Anchor pass is a no-op.
 */
export interface MarketSignal {
    /** Market p50 ADR for this date's month (anchor) */
    monthAnchorAdr?: number;
    /** Annual p50 ADR for the property's market */
    annualAnchorAdr?: number;
    /** Forward occupancy (0..1) for this date — drives demand multiplier */
    forwardOccupancy?: number;
    /** Market ADR for this exact date from future-pacing */
    pacingAdr?: number;
    /**
     * Max event uplift % across all events overlapping this date
     * (sourced from MarketEvent — SERP Google Events / Ticketmaster /
     * Eventbrite). e.g. 30 means +30%. Market-agnostic — works for any city.
     */
    eventUpliftPct?: number;
    /** Name of the dominant event driving the uplift (for reasoning) */
    eventName?: string;
    /**
     * Listing-level local demand pressure (0..1): the property's OWN forward
     * occupancy in a window around this date. This is the booking-velocity
     * signal — "are my own dates filling up?" — distinct from market occupancy.
     */
    localDemand?: number;
}

export interface DayResult {
    price: number;
    minimumStay: number;
    maximumStay: number;
    isAvailable: number; // 0 or 1
    closedToArrival: number; // 0 or 1
    closedToDeparture: number; // 0 or 1
    /**
     * Length-of-stay discount factors (1.0 = no discount). These map directly
     * onto Hostaway's weeklyPriceFactor / monthlyPriceFactor calendar fields,
     * so LOS pricing is now a real, channel-ready output — not just a note.
     */
    weeklyPriceFactor: number; // applied to stays >= 7 nights
    monthlyPriceFactor: number; // applied to stays >= 28 nights
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

    // ── Pass 0 — Market Anchor (Airbtics / comp set data) ─────────────────────
    // Adjusts basePrice multiplicatively for seasonality and forward demand.
    // No-op when no market signal is provided — preserves backward compatibility.

    let basePrice = config.basePrice;
    if (marketSignal) {
        // Seasonality: month anchor vs annual anchor (e.g. Dec p50=1100 vs annual p50=700 → 1.57x)
        if (
            marketSignal.monthAnchorAdr &&
            marketSignal.annualAnchorAdr &&
            marketSignal.annualAnchorAdr > 0
        ) {
            const seasonMult = marketSignal.monthAnchorAdr / marketSignal.annualAnchorAdr;
            // Cap multiplier to sane range to avoid garbage data wrecking pricing
            const capped = Math.min(2.0, Math.max(0.5, seasonMult));
            const before = basePrice;
            basePrice = basePrice * capped;
            notes.push(
                `[MARKET] Seasonality ${(capped * 100 - 100).toFixed(0)}% (month p50 ${marketSignal.monthAnchorAdr} vs annual ${marketSignal.annualAnchorAdr}) → ${before.toFixed(0)}→${basePrice.toFixed(0)}`
            );
        }

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
                    `[MARKET] Demand ${(demandMult * 100 - 100).toFixed(0)}% (market occ ${(occ * 100).toFixed(0)}%) → ${before.toFixed(0)}→${basePrice.toFixed(0)}`
                );
            }
        }

        // Market pacing: blend toward date-specific comp-set ADR.
        // If we have exact market pricing for this date, pull the listing's
        // price 40% toward it. This is the core "comp-aware" signal that
        // ensures the listing doesn't drift from what the market actually
        // charges for this date.
        if (marketSignal.pacingAdr && marketSignal.pacingAdr > 0) {
            const target = marketSignal.pacingAdr;
            const blendWeight = 0.4;
            const before = basePrice;
            basePrice = basePrice * (1 - blendWeight) + target * blendWeight;
            const delta = Math.round(((basePrice - before) / before) * 100);
            if (delta !== 0) {
                notes.push(
                    `[MARKET] Pacing blend ${delta > 0 ? "+" : ""}${delta}% toward market ${target.toFixed(0)} → ${before.toFixed(0)}→${basePrice.toFixed(0)}`
                );
            }
        }

        // Event-aware pricing: demand spike from a real event overlapping this
        // date (SERP Google Events / Ticketmaster / Eventbrite, cached in
        // MarketEvent). Applies on top of the seasonal/market anchor.
        if (marketSignal.eventUpliftPct && marketSignal.eventUpliftPct > 0) {
            const before = basePrice;
            basePrice = basePrice * (1 + marketSignal.eventUpliftPct / 100);
            notes.push(
                `[EVENT] +${marketSignal.eventUpliftPct}% "${marketSignal.eventName ?? "event"}" → ${before.toFixed(0)}→${basePrice.toFixed(0)}`
            );
        }

        // Booking velocity: the property's OWN forward occupancy around this
        // date. If our own calendar is filling fast, push price up (capture
        // willingness-to-pay); if it's empty and the date is near, ease price
        // down to stimulate bookings. Bounded and lead-time aware.
        if (typeof marketSignal.localDemand === "number") {
            const ld = marketSignal.localDemand;
            let paceMult = 1.0;
            if (ld >= 0.7) paceMult = 1.08;
            else if (ld >= 0.5) paceMult = 1.04;
            else if (ld <= 0.15 && leadTime <= 30) paceMult = 0.94;
            else if (ld <= 0.3 && leadTime <= 14) paceMult = 0.97;

            if (paceMult !== 1.0) {
                const before = basePrice;
                basePrice = basePrice * paceMult;
                notes.push(
                    `[PACE] ${(paceMult * 100 - 100).toFixed(0)}% (own occupancy ${(ld * 100).toFixed(0)}% near this date) → ${before.toFixed(0)}→${basePrice.toFixed(0)}`
                );
            }
        }
    }

    // ── Pass 1 — Foundation ────────────────────────────────────────────────────

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

    // ── Pass 2 — Strategy ─────────────────────────────────────────────────────

    // Last-minute discount
    if (
        config.lastMinuteEnabled &&
        !suspendLastMinute &&
        leadTime <= config.lastMinuteDaysOut &&
        leadTime >= 0 &&
        isAvailable === 1
    ) {
        price = price * (1 - config.lastMinuteDiscountPct / 100);
        notes.push(
            `[LAST_MINUTE] ${config.lastMinuteDiscountPct}% discount (${leadTime} days out)`
        );
        if (config.lastMinuteMinStay !== null) {
            minimumStay = config.lastMinuteMinStay;
            notes.push(`[LAST_MINUTE] min stay override to ${minimumStay}`);
        }
    }

    // Far-out premium
    if (
        config.farOutEnabled &&
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

    // ── Length-of-stay pricing ────────────────────────────────────────────────
    // Convert LOS_DISCOUNT rules into concrete weekly/monthly price factors
    // (1.0 = no discount). A -10% rule at 7+ nights → 0.90 weekly factor.
    // These ride along with every day so the channel can price longer stays
    // correctly — true LOS pricing, not just an informational note.
    let weeklyPriceFactor = 1;
    let monthlyPriceFactor = 1;
    const losRules = allRules.filter(
        (r) => r.enabled && r.ruleType === "LOS_DISCOUNT" && r.minNights !== null
    );

    if (losRules.length > 0) {
        for (const r of losRules) {
            if (r.priceAdjPct === null || r.minNights === null) continue;
            // priceAdjPct is negative for a discount (e.g. -10) → factor 0.90
            const factor = 1 + r.priceAdjPct / 100;
            if (factor <= 0 || factor > 1) continue; // ignore nonsensical values
            if (r.minNights >= 28) {
                monthlyPriceFactor = Math.min(monthlyPriceFactor, factor);
            } else if (r.minNights >= 7) {
                weeklyPriceFactor = Math.min(weeklyPriceFactor, factor);
            }
        }
        // A configured monthly discount should never be shallower than the
        // weekly one — longer stays earn at least the weekly break.
        monthlyPriceFactor = Math.min(monthlyPriceFactor, weeklyPriceFactor);

        notes.push(
            `[LOS] weekly x${weeklyPriceFactor.toFixed(2)} (${Math.round((weeklyPriceFactor - 1) * 100)}%), monthly x${monthlyPriceFactor.toFixed(2)} (${Math.round((monthlyPriceFactor - 1) * 100)}%)`
        );
    }

    // ── Pass 3 — Inventory (Gap Logic) ────────────────────────────────────────

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

    // Proactive orphan prevention: a booking is only a few nights ahead and no
    // booking sits before this day, so it isn't a "gap" between two bookings —
    // but a short stay starting here would still strand an un-bookable remnant
    // up against the next booking. Raise minStay to reach the booking so the
    // night can only be sold as part of a full, contiguous stay.
    if (
        config.gapPreventionEnabled &&
        isAvailable === 1 &&
        !bookingCtx.isBooked &&
        bookingCtx.gapLength === null &&
        typeof bookingCtx.daysUntilNextBooking === "number" &&
        bookingCtx.daysUntilNextBooking !== null &&
        bookingCtx.daysUntilNextBooking > 0 &&
        bookingCtx.daysUntilNextBooking < config.minFragmentThreshold
    ) {
        if (minimumStay < bookingCtx.daysUntilNextBooking) {
            minimumStay = bookingCtx.daysUntilNextBooking;
            notes.push(
                `[GAP_PREVENTION] minStay raised to ${minimumStay} — next booking is ${bookingCtx.daysUntilNextBooking} night(s) out; prevents stranding a sub-${config.minFragmentThreshold}-night orphan`
            );
        }
    }

    // ── Pass 4 — Integrity ────────────────────────────────────────────────────

    // A floor/ceiling of 0 means "not configured" — treat as no constraint.
    const effectiveMinPrice = ruleMinPrice ?? (config.absoluteMinPrice > 0 ? config.absoluteMinPrice : 0);
    const effectiveMaxPrice = ruleMaxPrice ?? (config.absoluteMaxPrice > 0 ? config.absoluteMaxPrice : Infinity);

    if (effectiveMinPrice > 0 && price < effectiveMinPrice) {
        notes.push(
            `[CLAMP] Price ${price.toFixed(2)} clamped to min ${effectiveMinPrice}`
        );
        price = effectiveMinPrice;
    }
    if (effectiveMaxPrice < Infinity && price > effectiveMaxPrice) {
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
        weeklyPriceFactor,
        monthlyPriceFactor,
        note: notes.join("; "),
    };
}

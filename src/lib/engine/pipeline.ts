import { connectDB, Listing, PricingRule, InventoryMaster, EngineRun, MarketEvent } from "@/lib/db";
import mongoose from "mongoose";
import {
    computeDay,
    ListingConfig,
    Rule,
    BookingContext,
    MarketSignal,
} from "./waterfall";
import { getMarketContext, resolveMarketId } from "@/lib/airbtics/market-context";

function toNum(val: string | number | null | undefined): number {
    if (val === null || val === undefined) return 0;
    return typeof val === "string" ? parseFloat(val) : val;
}

function toNumOrNull(val: string | number | null | undefined): number | null {
    if (val === null || val === undefined) return null;
    return typeof val === "string" ? parseFloat(val) : val;
}

function toIntArray(val: number[] | null | undefined): number[] {
    if (!val) return [1, 1, 1, 1, 1, 1, 1];
    return val;
}

function addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

function dateStr(d: Date): string {
    return d.toISOString().split("T")[0];
}

/**
 * Runs the pricing engine for a listing for the next 365 days.
 * Calculations are stored as proposals in InventoryMaster.
 */
export async function runPipeline(
    listingId: mongoose.Types.ObjectId | string,
    _triggerDetail?: string
) {
    await connectDB();

    const lid = typeof listingId === "string"
        ? new mongoose.Types.ObjectId(listingId)
        : listingId;

    const startedAt = new Date();

    try {
        const listing = await Listing.findById(lid).lean();
        if (!listing) {
            throw new Error(`Listing ${listingId} not found`);
        }

        const config: ListingConfig = {
            basePrice: toNum(listing.price),
            absoluteMinPrice: toNum(listing.priceFloor),
            absoluteMaxPrice: toNum(listing.priceCeiling),
            defaultMinStay: 1,
            defaultMaxStay: listing.defaultMaxStay ?? 365,
            lowestMinStayAllowed: listing.lowestMinStayAllowed,
            allowedCheckinDays: toIntArray(listing.allowedCheckinDays),
            allowedCheckoutDays: toIntArray(listing.allowedCheckoutDays),
            lastMinuteEnabled: listing.lastMinuteEnabled,
            lastMinuteDaysOut: listing.lastMinuteDaysOut,
            lastMinuteDiscountPct: toNum(listing.lastMinuteDiscountPct),
            lastMinuteMinStay: listing.lastMinuteMinStay ?? null,
            farOutEnabled: listing.farOutEnabled,
            farOutDaysOut: listing.farOutDaysOut,
            farOutMarkupPct: toNum(listing.farOutMarkupPct),
            farOutMinStay: listing.farOutMinStay ?? null,
            dowPricingEnabled: listing.dowPricingEnabled,
            dowDays: listing.dowDays ?? [4, 5],
            dowPriceAdjPct: toNum(listing.dowPriceAdjPct),
            dowMinStay: listing.dowMinStay ?? null,
            gapPreventionEnabled: listing.gapPreventionEnabled,
            minFragmentThreshold: listing.minFragmentThreshold,
            gapFillEnabled: listing.gapFillEnabled,
            gapFillLengthMin: listing.gapFillLengthMin,
            gapFillLengthMax: listing.gapFillLengthMax,
            gapFillDiscountPct: toNum(listing.gapFillDiscountPct),
            gapFillOverrideCico: listing.gapFillOverrideCico,
        };

        const ruleRows = await PricingRule.find({
            listingId: lid,
            enabled: true,
        }).sort({ priority: 1 }).lean();

        const allRules: Rule[] = ruleRows.map((r) => ({
            id: r._id.toString(),
            ruleType: r.ruleType as any,
            name: r.name,
            enabled: r.enabled,
            priority: r.priority,
            startDate: r.startDate ?? null,
            endDate: r.endDate ?? null,
            daysOfWeek: r.daysOfWeek ?? null,
            minNights: r.minNights ?? null,
            priceOverride: toNumOrNull(r.priceOverride),
            priceAdjPct: toNumOrNull(r.priceAdjPct),
            minPriceOverride: toNumOrNull(r.minPriceOverride),
            maxPriceOverride: toNumOrNull(r.maxPriceOverride),
            minStayOverride: r.minStayOverride ?? null,
            isBlocked: r.isBlocked,
            closedToArrival: r.closedToArrival,
            closedToDeparture: r.closedToDeparture,
            suspendLastMinute: r.suspendLastMinute,
            suspendGapFill: r.suspendGapFill,
        }));

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endDate = addDays(today, 364);

        const existingInventory = await InventoryMaster.find({
            listingId: lid,
            date: { $gte: dateStr(today) },
        }).sort({ date: 1 }).lean();

        const bookingMap = new Map<string, { isBooked: boolean }>();
        const existingPriceMap = new Map<string, number>();
        for (const day of existingInventory) {
            bookingMap.set(day.date, { isBooked: day.status !== "available" });
            if (day.currentPrice) existingPriceMap.set(day.date, day.currentPrice);
        }

        const gapMap = computeGaps(today, endDate, bookingMap);

        // Proactive orphan prevention: nights until the next booking, per date.
        const nextBookingMap = computeDaysUntilNextBooking(today, 365, bookingMap);

        // Booking velocity: the listing's OWN forward occupancy around each date.
        const localDemandMap = computeLocalDemand(today, 365, bookingMap);

        // ── Market signals from Airbtics (no-op if key/data missing) ──────────
        const marketSignals = await buildMarketSignals(
            listing.city || "Dubai",
            listing.countryCode || "AE",
            String(listing.bedroomsNumber || 2),
            today,
            365
        );

        // ── Event signals from MarketEvent (SERP / Ticketmaster / Eventbrite) ──
        // Org-scoped so one tenant's events never price another's calendar.
        const eventSignals = await buildEventSignals(listing.orgId, today, 365);

        let daysChanged = 0;
        const bulkOps: any[] = [];
        const listingBasePrice = toNum(listing.price);
        // Host-selected comp-set anchor (median trailing ADR). 0 / unset → no-op.
        const compAnchorAdr = toNum(listing.compAnchorAdr);

        for (let i = 0; i < 365; i++) {
            const currentDate = addDays(today, i);
            const ds = dateStr(currentDate);
            const booking = bookingMap.get(ds);
            const gap = gapMap.get(ds);

            const bookingCtx: BookingContext = {
                isBooked: booking?.isBooked ?? false,
                gapLength: gap?.gapLength ?? null,
                gapStart: gap?.gapStart ?? null,
                gapEnd: gap?.gapEnd ?? null,
                daysUntilNextBooking: nextBookingMap.get(ds) ?? null,
            };

            // Merge market (Airbtics) + comp-set anchor + event (MarketEvent) +
            // booking-velocity signals into one per-date MarketSignal.
            const mkt = marketSignals.get(ds);
            const evt = eventSignals.get(ds);
            const localDemand = localDemandMap.get(ds);
            let signal: MarketSignal | undefined = mkt ? { ...mkt } : undefined;
            if (evt || localDemand !== undefined || compAnchorAdr) {
                signal = { ...(signal ?? {}) };
                if (evt) {
                    signal.eventUpliftPct = evt.uplift;
                    signal.eventName = evt.name;
                }
                if (localDemand !== undefined) signal.localDemand = localDemand;
                if (compAnchorAdr) signal.compAnchorAdr = compAnchorAdr;
            }

            const result = computeDay(currentDate, today, config, allRules, bookingCtx, signal);

            // Compare proposed vs the current live price on this date
            // (what's already on the channel), not always vs listing base price.
            // This way "0% change" truly means "no action needed."
            const currentLivePrice = existingPriceMap.get(ds) ?? listingBasePrice;
            const changePct = currentLivePrice > 0
                ? Math.round(((result.price - currentLivePrice) / currentLivePrice) * 1000) / 10
                : 0;

            // Only reset proposalStatus to "pending" if the proposed price
            // actually differs from what was previously proposed — don't clobber
            // an existing approval with a re-run that produces the same number.
            const existingDay = existingInventory.find((d) => d.date === ds);
            const priceChanged = !existingDay ||
                Math.round((existingDay.proposedPrice ?? 0) * 100) !== Math.round(result.price * 100);
            const newStatus = priceChanged ? "pending"
                : (existingDay?.proposalStatus ?? "pending");

            bulkOps.push({
                updateOne: {
                    filter: { listingId: lid, date: ds },
                    update: {
                        $set: {
                            orgId: listing.orgId,
                            listingId: lid,
                            date: ds,
                            status: bookingCtx.isBooked ? "booked" : "available",
                            currentPrice: currentLivePrice,
                            basePrice: listingBasePrice,
                            proposedPrice: result.price,
                            changePct,
                            reasoning: result.note,
                            proposalStatus: newStatus,
                            minStay: result.minimumStay,
                            maxStay: result.maximumStay,
                            closedToArrival: result.closedToArrival === 1,
                            closedToDeparture: result.closedToDeparture === 1,
                            weeklyPriceFactor: result.weeklyPriceFactor,
                            monthlyPriceFactor: result.monthlyPriceFactor,
                            batchId: startedAt.toISOString(),
                        },
                    },
                    upsert: true,
                },
            });

            daysChanged++;
        }

        if (bulkOps.length > 0) {
            const BATCH_SIZE = 100;
            for (let i = 0; i < bulkOps.length; i += BATCH_SIZE) {
                await InventoryMaster.bulkWrite(bulkOps.slice(i, i + BATCH_SIZE));
            }
        }

        const durationMs = Date.now() - startedAt.getTime();
        const run = await EngineRun.create({
            orgId: listing.orgId,
            listingId: lid,
            startedAt,
            status: "SUCCESS",
            daysChanged,
            durationMs,
        });

        return run;
    } catch (err: any) {
        const durationMs = Date.now() - startedAt.getTime();
        const listing = await Listing.findById(lid).select("orgId").lean();
        await EngineRun.create({
            orgId: listing?.orgId || new mongoose.Types.ObjectId(),
            listingId: lid,
            startedAt,
            status: "FAILED",
            errorMessage: err.message,
            durationMs,
        });
        throw err;
    }
}

/**
 * Build a date→MarketSignal map for the next N days using Airbtics data.
 * Falls back to empty map (no-op) when API key/data missing.
 */
async function buildMarketSignals(
    city: string,
    countryCode: string,
    bedrooms: string,
    startDate: Date,
    days: number
): Promise<Map<string, MarketSignal>> {
    const map = new Map<string, MarketSignal>();
    try {
        const mktId = await resolveMarketId(city, countryCode);
        if (!mktId) return map;
        const ctx = await getMarketContext(mktId, bedrooms);
        if (!ctx.p50ADR) return map;

        // Build a per-month anchor from monthly metrics
        const monthAdr = new Map<string, number>();
        for (const m of ctx.monthlyMetrics) {
            if (m.month && m.p50_adr) monthAdr.set(m.month, m.p50_adr);
        }
        // Build a per-date pacing lookup
        const pacingMap = new Map<string, { occ?: number; adr?: number }>();
        for (const p of ctx.futurePacing) {
            pacingMap.set(p.date, { occ: p.occupancy, adr: p.adr });
        }

        const annualAnchor = ctx.p50ADR;
        for (let i = 0; i < days; i++) {
            const d = addDays(startDate, i);
            const ds = dateStr(d);
            const ym = ds.slice(0, 7);
            const monthAnchor = monthAdr.get(ym);
            const pacing = pacingMap.get(ds);
            const signal: MarketSignal = {};
            if (monthAnchor) signal.monthAnchorAdr = monthAnchor;
            if (annualAnchor) signal.annualAnchorAdr = annualAnchor;
            if (pacing?.occ !== undefined) signal.forwardOccupancy = pacing.occ;
            if (pacing?.adr !== undefined) signal.pacingAdr = pacing.adr;
            if (Object.keys(signal).length > 0) map.set(ds, signal);
        }
    } catch (err) {
        console.error("[buildMarketSignals]", (err as Error).message);
    }
    return map;
}

const EVENT_IMPACT_DEFAULT_UPLIFT: Record<string, number> = {
    high: 25,
    medium: 12,
    low: 5,
};

/**
 * Build a date→event uplift map from the MarketEvent collection. Events are
 * populated from verified feeds (SERP Google Events / Ticketmaster /
 * Eventbrite) by the Event Intelligence agent. When several events overlap a
 * date, the strongest uplift wins. Market-agnostic: works for any city.
 */
async function buildEventSignals(
    orgId: mongoose.Types.ObjectId,
    startDate: Date,
    days: number
): Promise<Map<string, { uplift: number; name: string }>> {
    const map = new Map<string, { uplift: number; name: string }>();
    try {
        const windowEnd = dateStr(addDays(startDate, days));
        const events = await MarketEvent.find({
            orgId,
            isActive: true,
            startDate: { $lte: windowEnd },
            endDate: { $gte: dateStr(startDate) },
        }).lean();
        if (events.length === 0) return map;

        for (let i = 0; i < days; i++) {
            const ds = dateStr(addDays(startDate, i));
            let best = 0;
            let name = "";
            for (const e of events) {
                if (ds < e.startDate || ds > e.endDate) continue;
                const uplift =
                    e.upliftPct && e.upliftPct > 0
                        ? e.upliftPct
                        : EVENT_IMPACT_DEFAULT_UPLIFT[e.impactLevel] ?? 0;
                if (uplift > best) {
                    best = uplift;
                    name = e.name;
                }
            }
            if (best > 0) map.set(ds, { uplift: best, name });
        }
    } catch (err) {
        console.error("[buildEventSignals]", (err as Error).message);
    }
    return map;
}

/**
 * For each available date, the number of nights until the next booking starts.
 * Drives proactive orphan-gap prevention in the waterfall.
 */
function computeDaysUntilNextBooking(
    startDate: Date,
    days: number,
    bookingMap: Map<string, { isBooked: boolean }>
): Map<string, number> {
    const booked: boolean[] = [];
    const dates: string[] = [];
    for (let i = 0; i < days; i++) {
        const ds = dateStr(addDays(startDate, i));
        dates.push(ds);
        booked.push(bookingMap.get(ds)?.isBooked ?? false);
    }

    const map = new Map<string, number>();
    // Walk backwards tracking the index of the nearest upcoming booked night.
    let nextBookedIdx = -1;
    for (let i = days - 1; i >= 0; i--) {
        if (booked[i]) {
            nextBookedIdx = i;
            continue;
        }
        if (nextBookedIdx > i) {
            map.set(dates[i], nextBookedIdx - i);
        }
    }
    return map;
}

/**
 * Booking velocity proxy: for each date, the property's OWN occupancy in a
 * symmetric window around it (±WINDOW nights). High = our calendar is filling
 * up near this date; low = soft demand. Distinct from market occupancy.
 */
function computeLocalDemand(
    startDate: Date,
    days: number,
    bookingMap: Map<string, { isBooked: boolean }>
): Map<string, number> {
    const WINDOW = 10;
    const booked: number[] = [];
    const dates: string[] = [];
    for (let i = 0; i < days; i++) {
        const ds = dateStr(addDays(startDate, i));
        dates.push(ds);
        booked.push(bookingMap.get(ds)?.isBooked ? 1 : 0);
    }

    const map = new Map<string, number>();
    for (let i = 0; i < days; i++) {
        const lo = Math.max(0, i - WINDOW);
        const hi = Math.min(days - 1, i + WINDOW);
        let sum = 0;
        for (let j = lo; j <= hi; j++) sum += booked[j];
        const occ = sum / (hi - lo + 1);
        map.set(dates[i], occ);
    }
    return map;
}

interface GapInfo {
    gapLength: number;
    gapStart: string;
    gapEnd: string;
}

function computeGaps(
    startDate: Date,
    endDate: Date,
    bookingMap: Map<string, { isBooked: boolean }>
): Map<string, GapInfo> {
    const gapMap = new Map<string, GapInfo>();
    const totalDays =
        Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    const dates: string[] = [];
    const booked: boolean[] = [];

    for (let i = 0; i < totalDays; i++) {
        const d = addDays(startDate, i);
        const ds = dateStr(d);
        dates.push(ds);
        const info = bookingMap.get(ds);
        booked.push(info?.isBooked ?? false);
    }

    let i = 0;
    while (i < totalDays) {
        if (booked[i]) { i++; continue; }

        const gapStartIdx = i;
        const hasBookingBefore = gapStartIdx > 0 && booked[gapStartIdx - 1];

        while (i < totalDays && !booked[i]) { i++; }

        const gapEndIdx = i - 1;
        const hasBookingAfter = i < totalDays && booked[i];

        if (hasBookingBefore && hasBookingAfter) {
            const gapLength = gapEndIdx - gapStartIdx + 1;
            const gapInfo: GapInfo = { gapLength, gapStart: dates[gapStartIdx], gapEnd: dates[gapEndIdx] };
            for (let j = gapStartIdx; j <= gapEndIdx; j++) {
                gapMap.set(dates[j], gapInfo);
            }
        }
    }

    return gapMap;
}

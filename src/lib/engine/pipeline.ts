import { connectDB, Listing, PricingRule, InventoryMaster, EngineRun } from "@/lib/db";
import mongoose from "mongoose";
import {
    computeDay,
    ListingConfig,
    Rule,
    BookingContext,
    MarketSignal,
} from "./waterfall";
import { getMarketContext, resolveMarketId } from "@/lib/airbtics/market-context";
import { fitElasticityModel } from "@/lib/elasticity/model";
import type { BookingObservation, ElasticityParams } from "@/lib/elasticity/types";
import { computeOptimizedPrice, isElasticityPricingEnabled } from "./optimization";
import { computeDemandModifier, getDefaultSignals } from "@/lib/demand/modifiers";
import {
    refreshListingCalendarFromHostaway,
    buildCalendarPriceMap,
    resolveDayCalendarPrice,
} from "./calendar-rates";

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
            dowDays: toIntArray(listing.dowDays),
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

        // Prefer Hostaway calendar rates (per-day) over the static listing base price.
        try {
            await refreshListingCalendarFromHostaway(lid, today, endDate);
        } catch (err) {
            console.warn(
                "[runPipeline] calendar refresh failed — using cached inventory:",
                (err as Error).message
            );
        }

        const existingInventory = await InventoryMaster.find({
            listingId: lid,
            date: { $gte: dateStr(today) },
        })
            .select("date status currentPrice")
            .sort({ date: 1 })
            .lean();

        const bookingMap = new Map<string, { isBooked: boolean }>();
        for (const day of existingInventory) {
            bookingMap.set(day.date, { isBooked: day.status !== "available" });
        }

        const gapMap = computeGaps(today, endDate, bookingMap);

        // ── Market signals from Airbtics (no-op if key/data missing) ──────────
        const marketSignals = await buildMarketSignals(
            listing.city || "",
            listing.countryCode || "",
            String(listing.bedroomsNumber || 2),
            today,
            365
        );

        let daysChanged = 0;
        const bulkOps: any[] = [];
        const listingFallbackPrice = toNum(listing.price);
        const calendarPriceByDate = buildCalendarPriceMap(
            existingInventory,
            listingFallbackPrice
        );
        const floor = config.absoluteMinPrice;
        const ceiling = config.absoluteMaxPrice;

        // ── Revenue optimization layer (elasticity + demand) ──────────────────
        // Fit the booking-probability model from this listing's own history,
        // and precompute the per-month source-market demand modifier. When the
        // ELASTICITY_PRICING flag is off (default) the optimized price is only
        // RECORDED as a shadow value; the rulebook price still drives proposals.
        const elasticityParams = await buildElasticityParams(lid, today, listingFallbackPrice);
        const elasticityEnabled = isElasticityPricingEnabled();
        const marketTemplate = (listing.city || "").toLowerCase();
        const demandByMonth = new Map<number, number>();
        const demandModifierFor = (month: number): number => {
            const cached = demandByMonth.get(month);
            if (cached !== undefined) return cached;
            let pct = 0;
            try {
                const signals = getDefaultSignals(marketTemplate, month);
                pct = computeDemandModifier(marketTemplate, month, signals).priceModifierPct;
            } catch {
                pct = 0;
            }
            demandByMonth.set(month, pct);
            return pct;
        };

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
            };

            const signal = marketSignals.get(ds);
            const dayCalendarPrice = resolveDayCalendarPrice(
                ds,
                calendarPriceByDate,
                listingFallbackPrice
            );
            const dayConfig: ListingConfig = {
                ...config,
                basePrice: dayCalendarPrice > 0 ? dayCalendarPrice : config.basePrice,
            };
            const result = computeDay(currentDate, today, dayConfig, allRules, bookingCtx, signal);

            // ── Revenue optimization ──────────────────────────────────────────
            // Only optimize bookable (available) days; booked/blocked days keep
            // the rulebook output. The optimized price is always guardrail-safe.
            let optimizedPrice = result.price;
            let elasticityPrice: number | undefined;
            let elasticityWeight: number | undefined;
            let pBook: number | undefined;
            if (result.isAvailable === 1 && ceiling > floor) {
                const month = currentDate.getMonth() + 1;
                const opt = computeOptimizedPrice({
                    rulebookPrice: result.price,
                    params: elasticityParams,
                    floor,
                    ceiling,
                    demandModifierPct: demandModifierFor(month),
                });
                elasticityPrice = opt.finalPrice;
                elasticityWeight = opt.weight;
                pBook = opt.pBook;
                if (elasticityEnabled) optimizedPrice = opt.finalPrice;
            }

            // Compute change % vs this day's Hostaway calendar rate.
            const changePct = dayCalendarPrice > 0
                ? Math.round(((optimizedPrice - dayCalendarPrice) / dayCalendarPrice) * 1000) / 10
                : 0;

            bulkOps.push({
                updateOne: {
                    filter: { listingId: lid, date: ds },
                    update: {
                        $set: {
                            orgId: listing.orgId,
                            listingId: lid,
                            date: ds,
                            status: bookingCtx.isBooked ? "booked" : "available",
                            currentPrice: dayCalendarPrice,
                            basePrice: dayCalendarPrice,
                            proposedPrice: optimizedPrice,
                            elasticityPrice,
                            elasticityWeight,
                            pBook,
                            changePct,
                            reasoning: result.note,
                            proposalStatus: "pending",
                            minStay: result.minimumStay,
                            maxStay: result.maximumStay,
                            closedToArrival: result.closedToArrival === 1,
                            closedToDeparture: result.closedToDeparture === 1,
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

/**
 * Fit the elasticity (booking-probability) model from this listing's own
 * recent calendar history. Each past day is a (price, booked) observation.
 * With little/no history the model returns cold-start defaults anchored on
 * the listing base price, so the optimizer's confidence weight stays ~0 and
 * pricing collapses back to the deterministic rulebook.
 */
async function buildElasticityParams(
    lid: mongoose.Types.ObjectId,
    today: Date,
    fallbackAdr: number
): Promise<ElasticityParams> {
    const HISTORY_DAYS = 365;
    const since = addDays(today, -HISTORY_DAYS);
    const past = await InventoryMaster.find({
        listingId: lid,
        date: { $gte: dateStr(since), $lt: dateStr(today) },
    })
        .select("date currentPrice status")
        .lean();

    const observations: BookingObservation[] = [];
    for (const day of past) {
        const price = toNum(day.currentPrice);
        if (!(price > 0)) continue;
        const d = new Date(`${day.date}T00:00:00.000Z`);
        const dow = d.getUTCDay(); // 0=Sun..6=Sat
        observations.push({
            date: day.date,
            price,
            booked: day.status !== "available",
            leadTimeDays: 0,
            isWeekend: dow === 6 || dow === 0, // Sat/Sun (model feature only; not market-specific)
        });
    }

    return fitElasticityModel(observations, fallbackAdr > 0 ? fallbackAdr : undefined);
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

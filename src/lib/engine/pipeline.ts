import { connectDB, Listing, PricingRule, InventoryMaster, EngineRun } from "@/lib/db";
import mongoose from "mongoose";
import {
    computeDay,
    ListingConfig,
    Rule,
    BookingContext,
} from "./waterfall";

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

        const existingInventory = await InventoryMaster.find({
            listingId: lid,
            date: { $gte: dateStr(today) },
        }).sort({ date: 1 }).lean();

        const bookingMap = new Map<string, { isBooked: boolean }>();
        for (const day of existingInventory) {
            bookingMap.set(day.date, { isBooked: day.status !== "available" });
        }

        const gapMap = computeGaps(today, endDate, bookingMap);

        let daysChanged = 0;
        const bulkOps: any[] = [];

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

            const result = computeDay(currentDate, today, config, allRules, bookingCtx);

            bulkOps.push({
                updateOne: {
                    filter: { listingId: lid, date: ds },
                    update: {
                        $set: {
                            orgId: listing.orgId,
                            listingId: lid,
                            date: ds,
                            status: bookingCtx.isBooked ? "booked" : "available",
                            currentPrice: toNum(listing.price),
                            proposedPrice: result.price,
                            reasoning: result.note,
                            proposalStatus: "pending",
                            minStay: result.minimumStay,
                            maxStay: result.maximumStay,
                            closedToArrival: result.closedToArrival === 1,
                            closedToDeparture: result.closedToDeparture === 1,
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

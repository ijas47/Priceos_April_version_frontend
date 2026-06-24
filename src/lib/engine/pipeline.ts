import {
    connectDB,
    Listing,
    InventoryMaster,
    EngineRun,
    PropertyGroup,
    MarketTemplate,
    Organization,
    BenchmarkData,
    Reservation,
    MarketEvent,
} from "@/lib/db";
import {
    loadPricingContext,
    mergeRules,
    applyProfileToConfig,
} from "@/lib/pricing/resolve";
import {
    resolveMinStayProfileForDate,
    computeMinStayFromProfile,
    nightsUntilNextBooked,
    resolveWeekendDays,
} from "@/lib/pricing/minstay-resolve";
import mongoose from "mongoose";
import {
    computeDay,
    ListingConfig,
    Rule,
    BookingContext,
    MarketSignal,
} from "./waterfall";
import { isAvailable as isAirbticsApiConfigured } from "@/lib/airbtics/client";
import { getCompSet, getMarketContext, resolveMarketId } from "@/lib/airbtics/market-context";
import { resolveAreaBounds } from "@/lib/pricing/area-bounds";
import {
    compSetPercentilesFromAirbtics,
    compSetPercentilesFromBenchmark,
    type CompSetPercentiles,
} from "@/lib/pricing/market-anchor";
import { resolveDynamicFloor } from "@/lib/pricing/dynamic-floor";
import { buildStlySummary, shiftIsoDate } from "@/lib/pricing/stly";
import { computeDaysSinceLastBooking } from "@/lib/pricing/booking-recency";
import { detectCrisisRegime } from "@/lib/pricing/crisis-regime";
import {
    resolveDemandRegime,
    resolveDistressedEffectiveFloor,
} from "@/lib/pricing/demand-regime";
import {
    isDubaiMarket,
    buildDubaiMarketSignals,
    buildDubaiMarketContext,
    resolveDubaiCompSetPercentiles,
    mergeMarketSignals,
    hasAirbticsPacingData,
    isDubaiDatasetReady,
} from "@/lib/market/dubai-airroi";
import { resolveBedroomsNumber } from "@/lib/pricing/bedrooms";
import {
    computeBookingPace,
    paceRatioForLeadTime,
    type BookingPaceSummary,
} from "@/lib/pricing/booking-pace";
import {
    resolveBlendedOccupancyPct,
    occupancyToPct,
} from "@/lib/pricing/occupancy-blend";
import { fitElasticityModel } from "@/lib/elasticity/model";
import type { BookingObservation, ElasticityParams } from "@/lib/elasticity/types";
import { computeOptimizedPrice, isElasticityPricingEnabled } from "./optimization";
import { computeDemandModifier, getDefaultSignals } from "@/lib/demand/modifiers";
import {
    refreshListingCalendarFromHostaway,
    buildCalendarPriceMap,
} from "@/lib/engine/calendar-rates";
import { resolvePipelineListedPrice } from "@/lib/pricing/listing-price-sanity";
import {
    applyStrategyPresetToConfig,
    resolveMonthlyGuardrailBand,
} from "@/lib/pricing/strategy-runtime";
import {
    resolveStrategyPreset,
    type Strategy,
} from "@/lib/pricing/strategy-presets";
import { applyProposalGuardrails } from "@/lib/pricing/proposal-guardrails";
import { applyEventUplift } from "@/lib/pricing/event-pricing";
import { usesMonthFirstAnchor } from "@/lib/pricing/anchor-weights";

function filterLegacySeasonRules(rules: Rule[]): Rule[] {
    return rules.filter(
        (r) =>
            r.ruleType !== "SEASON" ||
            (!String(r.name).startsWith("[UAE]") && !String(r.name).startsWith("[Auto]"))
    );
}

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

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const pricingCtx = await loadPricingContext(lid, listing.orgId, today);
        const allRules: Rule[] = filterLegacySeasonRules(mergeRules(pricingCtx));

        const [groupDoc, orgRow] = await Promise.all([
            PropertyGroup.findOne({
                orgId: listing.orgId,
                listingIds: lid,
            })
                .select("seasonalCalendarOverrideId pricingProfileOverrideId minStayProfileOverrideId seasonalCalendarOverrideId")
                .lean(),
            Organization.findById(listing.orgId)
                .select("marketCode pricingStrategy settings.guardrails eventPricingWeight")
                .lean(),
        ]);

        const strategyPreset = resolveStrategyPreset(
            (orgRow?.pricingStrategy as Strategy | undefined) ?? "balanced"
        );
        const orgGuardrails = orgRow?.settings?.guardrails ?? undefined;
        const eventWeight =
            (orgRow?.eventPricingWeight as "low" | "medium" | "high" | undefined) ?? "low";

        const orgTemplate = await MarketTemplate.findOne({
            marketCode: orgRow?.marketCode ?? "UAE_DXB",
        }).lean();
        const weekendDays = resolveWeekendDays(orgTemplate?.weekendDefinition ?? "thu_fri");

        const listingListedPrice = toNum(listing.price);
        const validatedBasePrice = toNum(listing.validatedBasePrice);
        const pmsPriceTrusted = listing.pmsPriceTrusted !== false;
        const pipelineBasePrice =
            !pmsPriceTrusted && validatedBasePrice > 0
                ? validatedBasePrice
                : listingListedPrice;

        const baseConfig: ListingConfig = {
            basePrice: pipelineBasePrice,
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
            lastMinuteRampEnabled: listing.lastMinuteRampEnabled,
            lastMinuteRampDays: listing.lastMinuteRampDays,
            lastMinuteMaxDiscountPct: toNum(listing.lastMinuteMaxDiscountPct),
            lastMinuteMinDiscountPct: toNum(listing.lastMinuteMinDiscountPct),
            occupancyEnabled: listing.occupancyEnabled,
            occupancyMatrix: listing.occupancyMatrix as ListingConfig["occupancyMatrix"],
            occupancyPct: pricingCtx.occupancyPct,
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

        const strategyBaseConfig = applyStrategyPresetToConfig(baseConfig, orgRow?.pricingStrategy as Strategy | undefined);

        const endDate = addDays(today, 364);
        const todayStr = dateStr(today);
        const crisisWindowEnd = dateStr(addDays(today, 90));
        const pipelineEndStrEarly = dateStr(addDays(today, 364));

        const [lastReservation, crisisEventRows, marketEventRows] = await Promise.all([
            Reservation.findOne({
                listingId: lid,
                status: { $in: ["confirmed", "pending", "checked_in", "checked_out"] },
                checkOut: { $lte: todayStr },
            })
                .sort({ checkOut: -1 })
                .select("checkOut")
                .lean(),
            MarketEvent.find({
                orgId: listing.orgId,
                isActive: true,
                endDate: { $gte: todayStr },
                startDate: { $lte: crisisWindowEnd },
            })
                .select("name description impactLevel confidence")
                .limit(100)
                .lean(),
            MarketEvent.find({
                orgId: listing.orgId,
                isActive: true,
                endDate: { $gte: todayStr },
                startDate: { $lte: pipelineEndStrEarly },
            })
                .select("name startDate endDate impactLevel")
                .lean(),
        ]);

        const eventsByDate = new Map<string, { name: string; impactLevel: "high" | "medium" | "low" }[]>();
        for (const ev of marketEventRows) {
            const impact = (ev.impactLevel === "high" || ev.impactLevel === "medium" || ev.impactLevel === "low")
                ? ev.impactLevel
                : "low";
            const start = new Date(`${ev.startDate}T00:00:00.000Z`);
            const end = new Date(`${ev.endDate}T00:00:00.000Z`);
            for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
                const key = dateStr(d);
                const bucket = eventsByDate.get(key) ?? [];
                bucket.push({ name: ev.name, impactLevel: impact });
                eventsByDate.set(key, bucket);
            }
        }

        const daysSinceLastBooking = computeDaysSinceLastBooking(
            today,
            lastReservation?.checkOut ?? null
        );
        const bookingRecencyConfig = pricingCtx.pack.portfolioDefaults.bookingRecency;
        const crisisRegime = detectCrisisRegime(
            crisisEventRows.map((e) => ({
                name: e.name,
                description: e.description,
                impactLevel: e.impactLevel,
                confidence: e.confidence,
            }))
        );

        // Prefer Hostaway calendar rates (per-day) over the static listing base price.
        try {
            await refreshListingCalendarFromHostaway(lid, today, endDate);
        } catch (err) {
            console.warn(
                "[runPipeline] calendar refresh failed - using cached inventory:",
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

        const pipelineEndDate = addDays(today, 364);
        const pipelineEndStr = dateStr(pipelineEndDate);

        // ── Market signals (Dubai open data primary, Airbtics fallback) ───────
        let marketSignals = await buildMarketSignals(listing, today, 365);

        const stlyFrom = shiftIsoDate(todayStr, -1);
        const stlyTo = shiftIsoDate(pipelineEndStr, -1);
        const [stlyInventory, stlyReservations, forwardReservations] = await Promise.all([
            InventoryMaster.find({
                listingId: lid,
                date: { $gte: stlyFrom, $lte: stlyTo },
            })
                .select("date currentPrice status")
                .lean(),
            Reservation.find({
                listingId: lid,
                checkIn: { $lte: stlyTo },
                checkOut: { $gte: stlyFrom },
                status: { $in: ["confirmed", "pending", "checked_in", "checked_out"] },
            })
                .select("checkIn checkOut nights totalPrice status")
                .lean(),
            Reservation.find({
                listingId: lid,
                checkIn: { $lte: pipelineEndStr },
                checkOut: { $gte: todayStr },
                status: { $in: ["confirmed", "pending", "checked_in", "checked_out"] },
            })
                .select("checkIn checkOut status")
                .lean(),
        ]);

        const bookingPace = computeBookingPace({
            today: todayStr,
            forwardInventory: existingInventory.map((r) => ({
                date: r.date,
                status: r.status,
            })),
            forwardReservations: forwardReservations.map((r) => ({
                checkIn: r.checkIn,
                checkOut: r.checkOut,
                status: r.status,
            })),
            stlyInventory: stlyInventory.map((r) => ({
                date: r.date,
                status: r.status,
            })),
            stlyReservations: stlyReservations.map((r) => ({
                checkIn: r.checkIn,
                checkOut: r.checkOut,
                status: r.status,
            })),
        });
        marketSignals = enrichMarketSignalsWithPace(
            marketSignals,
            bookingPace,
            today,
            365
        );

        const city = listing.city || "Dubai";
        const countryCode = listing.countryCode || "AE";
        let blendedOccupancyPct = pricingCtx.occupancyPct;
        if (isDubaiMarket(city, countryCode) && (await isDubaiDatasetReady())) {
            const dubaiCtx = await buildDubaiMarketContext(
                listing.area || city,
                city,
                resolveBedroomsNumber(listing.bedroomsNumber, 1)
            );
            const marketOccPct = occupancyToPct(dubaiCtx?.latestMonth?.avgOccupancy);
            blendedOccupancyPct = resolveBlendedOccupancyPct({
                listingOccPct: pricingCtx.occupancyPct,
                marketOccPct,
                listingHistoryDays: listing.occupancyLookbackDays ?? 30,
            });
        }
        const stlySummary = buildStlySummary(
            dateStr(today),
            dateStr(pipelineEndDate),
            stlyInventory.map((r) => ({
                date: r.date,
                currentPrice: r.currentPrice,
                status: r.status,
            })),
            stlyReservations.map((r) => ({
                checkIn: r.checkIn,
                checkOut: r.checkOut,
                nights: r.nights,
                totalPrice: Number(r.totalPrice || 0),
                status: r.status,
            }))
        );
        const stlyRateByDate = new Map(
            stlySummary.days.map((d) => [d.date, d.stly_rate])
        );

        const forwardOccSamples: number[] = [];
        for (let i = 0; i < 30; i++) {
            const sig = marketSignals.get(dateStr(addDays(today, i)));
            if (sig?.forwardOccupancy != null && sig.forwardOccupancy > 0) {
                forwardOccSamples.push(sig.forwardOccupancy);
            }
        }
        const avgForwardOcc =
            forwardOccSamples.length > 0
                ? forwardOccSamples.reduce((s, v) => s + v, 0) / forwardOccSamples.length
                : null;

        const firstSignal = marketSignals.get(todayStr);
        const demandRegime = resolveDemandRegime({
            forwardOccupancy: avgForwardOcc,
            marketOccupancy: firstSignal?.marketOccupancy ?? null,
            portfolioOccupancyPct: pricingCtx.occupancyPct,
            bookingPaceRatio: bookingPace.primaryPaceRatio,
            crisisTier: crisisRegime.tier,
            month: today.getMonth() + 1,
            city,
            countryCode,
            listedPrice: pipelineBasePrice,
            pacingAdr: firstSignal?.pacingAdr ?? null,
        });

        let daysChanged = 0;
        const bulkOps: any[] = [];
        const listingFallbackPrice = pipelineBasePrice;
        const calendarPriceByDate = buildCalendarPriceMap(
            existingInventory,
            listingListedPrice
        );
        const staticFloor = baseConfig.absoluteMinPrice;
        const ceiling = baseConfig.absoluteMaxPrice;

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
            const dayCalendarPrice = resolvePipelineListedPrice({
                date: ds,
                calendarPriceByDate,
                listingFallbackPrice: listingListedPrice,
                validatedBasePrice: validatedBasePrice > 0 ? validatedBasePrice : null,
                pmsPriceTrusted,
            });
            let dayConfig: ListingConfig = {
                ...strategyBaseConfig,
                basePrice: dayCalendarPrice > 0 ? dayCalendarPrice : strategyBaseConfig.basePrice,
                occupancyPct: blendedOccupancyPct,
            };
            dayConfig = applyProfileToConfig(
                dayConfig,
                listing,
                pricingCtx.pack,
                currentDate,
                groupDoc
                    ? {
                          seasonalCalendarOverrideId: groupDoc.seasonalCalendarOverrideId,
                          pricingProfileOverrideId: groupDoc.pricingProfileOverrideId,
                      }
                    : undefined,
                signal
            );

            const leadTime = Math.round(
                (currentDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
            );
            const { profile: minStayProfile } = resolveMinStayProfileForDate(
                pricingCtx.pack,
                currentDate,
                {
                    seasonalCalendarId:
                        listing.seasonalCalendarOverrideId ??
                        groupDoc?.seasonalCalendarOverrideId,
                    minStayProfileOverrideId:
                        listing.minStayProfileOverrideId ?? groupDoc?.minStayProfileOverrideId,
                }
            );
            if (minStayProfile && listing.usePortfolioPricingDefaults !== false) {
                const nightsBefore = nightsUntilNextBooked(currentDate, bookingMap);
                dayConfig = {
                    ...dayConfig,
                    defaultMinStay: computeMinStayFromProfile(
                        minStayProfile,
                        currentDate,
                        leadTime,
                        weekendDays,
                        nightsBefore
                    ),
                };
            }

            const monthBand = resolveMonthlyGuardrailBand({
                staticFloor,
                staticCeiling: ceiling,
                monthP25: signal?.compSetP25 ?? null,
                monthP75: signal?.compSetP75 ?? null,
                monthP50: signal?.monthAnchorAdr ?? signal?.compSetP50 ?? null,
                preset: strategyPreset,
                demandRegime: demandRegime.regime,
            });

            const regimeStaticFloor = resolveDistressedEffectiveFloor({
                staticFloor: monthBand.floor,
                listedPrice: dayCalendarPrice,
                pacingAdr: signal?.pacingAdr ?? null,
                regime: demandRegime,
            });

            const floorResult = resolveDynamicFloor({
                staticFloor: regimeStaticFloor,
                leadTimeDays: leadTime,
                stlyRate: stlyRateByDate.get(ds) ?? null,
                safetyConfig: pricingCtx.pack.portfolioDefaults.safetyMinimumPrice,
                compSetP25: signal?.compSetP25 ?? null,
                suspendCompFloorGuard: demandRegime.suspendCompFloorGuard,
            });
            dayConfig.absoluteMinPrice = floorResult.floor;
            dayConfig.absoluteMaxPrice = monthBand.ceiling;
            dayConfig.bookingRecency = bookingRecencyConfig;
            dayConfig.daysSinceLastBooking = daysSinceLastBooking;
            dayConfig.crisisTier = crisisRegime.tier;
            dayConfig.demandRegime = demandRegime.regime;
            dayConfig.demandAnchorScale = demandRegime.anchorScale;
            dayConfig.demandMaxFloorVsListedPct = demandRegime.maxFloorVsListedPct;

            const result = computeDay(currentDate, today, dayConfig, allRules, bookingCtx, signal);

            const reasoningParts = [
                result.note,
                monthBand.note,
                floorResult.note,
            ].filter(Boolean);
            if (signal && usesMonthFirstAnchor(signal) && i === 0) {
                reasoningParts.unshift("[SEASON] Month-first market anchor (calendar profiles only)");
            }
            if (bookingPace.primaryPaceRatio != null && i === 0) {
                const w60 = bookingPace.windows.find((w) => w.horizonDays === 60);
                if (w60) {
                    reasoningParts.unshift(
                        `[PACE] 60d pickup ${w60.bookedNights} vs STLY ${w60.stlyBookedNights} (${((w60.paceRatio ?? 1) * 100).toFixed(0)}%)`
                    );
                }
            }
            if (crisisRegime.tier > 0 && crisisRegime.reason) {
                reasoningParts.unshift(
                    `[CRISIS] Tier ${crisisRegime.tier}: ${crisisRegime.reason}`
                );
            }
            if (i === 0 && demandRegime.regime !== "normal") {
                reasoningParts.unshift(
                    `[DEMAND] ${demandRegime.regime.toUpperCase()} (score ${demandRegime.score}) - ${demandRegime.reasons.join(", ")}`
                );
            }

            // ── Revenue optimization ──────────────────────────────────────────
            // Only optimize bookable (available) days; booked/blocked days keep
            // the rulebook output. The optimized price is always guardrail-safe.
            let optimizedPrice = result.price;
            let elasticityPrice: number | undefined;
            let elasticityWeight: number | undefined;
            let pBook: number | undefined;
            const effectiveFloor = floorResult.floor;
            const effectiveCeiling = monthBand.ceiling;
            if (result.isAvailable === 1 && effectiveCeiling > effectiveFloor) {
                const month = currentDate.getMonth() + 1;
                const opt = computeOptimizedPrice({
                    rulebookPrice: result.price,
                    params: elasticityParams,
                    floor: effectiveFloor,
                    ceiling: effectiveCeiling,
                    demandModifierPct: demandModifierFor(month),
                });
                elasticityPrice = opt.finalPrice;
                elasticityWeight = opt.weight;
                pBook = opt.pBook;
                if (elasticityEnabled) optimizedPrice = opt.finalPrice;
            }

            const dayEvents = eventsByDate.get(ds) ?? [];
            if (dayEvents.length > 0 && result.isAvailable === 1) {
                const eventAdj = applyEventUplift(optimizedPrice, dayEvents, eventWeight);
                optimizedPrice = Math.min(eventAdj.price, effectiveCeiling);
                if (eventAdj.reasoning) reasoningParts.push(eventAdj.reasoning);
            }

            const guardrailed = applyProposalGuardrails({
                proposedPrice: optimizedPrice,
                currentPrice: dayCalendarPrice,
                guardrails: orgGuardrails,
                isBooked: bookingCtx.isBooked,
            });
            optimizedPrice = guardrailed.proposedPrice;
            reasoningParts.push(...guardrailed.guardrailNotes);

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
                            changePct: guardrailed.changePct,
                            reasoning: reasoningParts.join("; "),
                            proposalStatus: guardrailed.proposalStatus,
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

interface ListingMarketInput {
    _id: mongoose.Types.ObjectId;
    city?: string;
    countryCode?: string;
    area?: string;
    bedroomsNumber?: number;
}

/**
 * Build a date→MarketSignal map for the next N days.
 * Dubai local data: month anchors + comp percentiles (UAE seasonal wedge).
 * Airbtics (when API key set): forward occupancy + pacing ADR per day.
 */
async function buildMarketSignals(
    listing: ListingMarketInput,
    startDate: Date,
    days: number
): Promise<Map<string, MarketSignal>> {
    const city = listing.city || "Dubai";
    const countryCode = listing.countryCode || "AE";
    const bedrooms = resolveBedroomsNumber(listing.bedroomsNumber, 1);

    let dubaiMap = new Map<string, MarketSignal>();
    if (isDubaiMarket(city, countryCode) && (await isDubaiDatasetReady())) {
        try {
            dubaiMap = await buildDubaiMarketSignals(
                listing.area || city,
                city,
                bedrooms,
                startDate,
                days
            );
        } catch (err) {
            console.warn("[buildMarketSignals] Dubai dataset:", (err as Error).message);
        }
    }

    let airbticsMap = new Map<string, MarketSignal>();
    try {
        airbticsMap = await buildAirbticsMarketSignals(
            listing,
            city,
            countryCode,
            startDate,
            days
        );
    } catch (err) {
        console.error("[buildMarketSignals] Airbtics:", (err as Error).message);
    }

    const airbticsLive =
        isAirbticsApiConfigured() &&
        airbticsMap.size > 0 &&
        hasAirbticsPacingData(airbticsMap);

    return mergeMarketSignals(dubaiMap, airbticsMap, { airbticsLive });
}

/** Airbtics-backed signals - used as fallback when Dubai open data is missing fields. */
async function buildAirbticsMarketSignals(
    listing: ListingMarketInput,
    city: string,
    countryCode: string,
    startDate: Date,
    days: number
): Promise<Map<string, MarketSignal>> {
    const map = new Map<string, MarketSignal>();
    const bedrooms = String(resolveBedroomsNumber(listing.bedroomsNumber, 1));
    const endDate = addDays(startDate, days - 1);

    const mktId = await resolveMarketId(city, countryCode);
    if (!mktId) return map;

    const ctx = await getMarketContext(mktId, bedrooms);

    const compPercentiles = await resolveCompSetPercentiles(
        listing,
        city,
        countryCode,
        startDate,
        endDate,
        { skipDubai: true }
    );

    const monthAdr = new Map<string, number>();
    for (const m of ctx.monthlyMetrics) {
        if (m.month && m.p50_adr) monthAdr.set(m.month, m.p50_adr);
    }
    const pacingMap = new Map<string, { occ?: number; adr?: number }>();
    for (const p of ctx.futurePacing) {
        pacingMap.set(p.date, { occ: p.occupancy, adr: p.adr });
    }

    const annualAnchor = ctx.p50ADR;
    const marketOcc = ctx.occupancy ?? null;
    const activeListings = ctx.activeListings ?? null;
    const supplyPressure =
        marketOcc != null
            ? Math.max(0, Math.min(1, 1 - marketOcc))
            : undefined;

        const fallbackCompP50 =
        compPercentiles.p50 ??
        (annualAnchor && annualAnchor > 0 ? Math.round(annualAnchor) : undefined);

    const monthMetricsByYm = new Map(
        ctx.monthlyMetrics
            .filter((m) => m.month)
            .map((m) => [m.month as string, m])
    );

    for (let i = 0; i < days; i++) {
        const d = addDays(startDate, i);
        const ds = dateStr(d);
        const ym = ds.slice(0, 7);
        const monthAnchor = monthAdr.get(ym);
        const monthMetrics = monthMetricsByYm.get(ym);
        const pacing = pacingMap.get(ds);
        const signal: MarketSignal = {};
        const monthCompP50 = monthAnchor ?? fallbackCompP50;
        if (monthCompP50) {
            signal.compSetP50 = monthCompP50;
            signal.compSetP25 = monthMetrics?.p25_adr ?? compPercentiles.p25 ?? undefined;
            signal.compSetP75 = monthMetrics?.p75_adr ?? compPercentiles.p75 ?? undefined;
            signal.compSetSource = monthAnchor ? "airbtics_monthly" : compPercentiles.source;
        }
        if (monthAnchor) signal.monthAnchorAdr = monthAnchor;
        if (annualAnchor) signal.annualAnchorAdr = annualAnchor;
        if (pacing?.occ !== undefined) signal.forwardOccupancy = pacing.occ;
        if (pacing?.adr !== undefined) signal.pacingAdr = pacing.adr;
        if (marketOcc != null) signal.marketOccupancy = marketOcc;
        if (activeListings != null) signal.activeListings = activeListings;
        if (supplyPressure != null) signal.supplyPressure = supplyPressure;
        if (Object.keys(signal).length > 0) map.set(ds, signal);
    }

    return map;
}

async function resolveCompSetPercentiles(
    listing: ListingMarketInput,
    city: string,
    countryCode: string,
    startDate: Date,
    endDate: Date,
    options?: { skipDubai?: boolean }
): Promise<CompSetPercentiles> {
    const bedrooms = resolveBedroomsNumber(listing.bedroomsNumber, 1);
    const bounds = resolveAreaBounds(listing.area || city, city);

    if (!options?.skipDubai && bounds && isDubaiMarket(city, countryCode)) {
        try {
            if (await isDubaiDatasetReady()) {
                const fromDubai = await resolveDubaiCompSetPercentiles(bounds, bedrooms);
                if (fromDubai.p50) return fromDubai;
            }
        } catch (err) {
            console.warn("[resolveCompSetPercentiles] Dubai dataset:", (err as Error).message);
        }
    }

    if (bounds) {
        try {
            const compSet = await getCompSet(bounds, bedrooms);
            if (compSet.listings.length > 0) {
                const fromAirbtics = compSetPercentilesFromAirbtics(compSet.listings);
                if (fromAirbtics.p50) return fromAirbtics;
            }
        } catch (err) {
            console.warn("[resolveCompSetPercentiles] Airbtics comps:", (err as Error).message);
        }
    }

    try {
        const bench = await BenchmarkData.findOne({
            listingId: listing._id,
            dateFrom: { $lte: dateStr(endDate) },
            dateTo: { $gte: dateStr(startDate) },
        })
            .sort({ createdAt: -1 })
            .lean();

        if (bench) {
            return compSetPercentilesFromBenchmark(bench.comps ?? [], {
                p25Rate: bench.p25Rate,
                p50Rate: bench.p50Rate,
                p75Rate: bench.p75Rate,
            });
        }
    } catch (err) {
        console.warn("[resolveCompSetPercentiles] benchmark:", (err as Error).message);
    }

    return { p25: null, p50: null, p75: null, count: 0, source: "market_summary" };
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

function enrichMarketSignalsWithPace(
    signals: Map<string, MarketSignal>,
    paceSummary: BookingPaceSummary,
    today: Date,
    days: number
): Map<string, MarketSignal> {
    const enriched = new Map(signals);
    for (let i = 0; i < days; i++) {
        const currentDate = addDays(today, i);
        const ds = dateStr(currentDate);
        const leadTime = Math.round(
            (currentDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );
        const paceRatio = paceRatioForLeadTime(paceSummary, leadTime);
        if (paceRatio == null) continue;
        const existing = enriched.get(ds) ?? {};
        enriched.set(ds, { ...existing, bookingPaceRatio: paceRatio });
    }
    return enriched;
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

import { NextRequest, NextResponse } from "next/server";
import {
    connectDB,
    MarketEvent,
    BenchmarkData,
    Listing,
    InventoryMaster,
    Reservation,
} from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { assertListingOwned, ListingAccessError } from "@/lib/db/assert-listing-owned";
import {
    MARKET_RESEARCH_ID,
    BENCHMARK_AGENT_ID,
    GUARDRAILS_AGENT_ID,
} from "@/lib/agents/constants";
import { gatherMarketIntelligence } from "@/lib/research/aggregator";
import { upsertVerifiedFindings } from "@/lib/research/ensure-market-intel";
import { getStaticHolidaysForWindow } from "@/lib/research/static-holidays";
import { resolveDtcmEligibility } from "@/lib/research/dtcm-eligibility";
import { getMarketContext, resolveMarketId } from "@/lib/airbtics/market-context";
import { resolveBedroomsNumber, bedroomsLabel } from "@/lib/pricing/bedrooms";
import { assessBenchmarkSanity } from "@/lib/pricing/benchmark-sanity";
import { buildDubaiMarketContext } from "@/lib/market/dubai-airroi";
import {
    getCalendarAvgPrice,
    refreshListingCalendarFromHostaway,
} from "@/lib/engine/calendar-rates";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";

async function callLyzrAgent(agentId: string, message: string) {
    const LYZR_API_KEY = process.env.LYZR_API_KEY;
    const LYZR_API_URL = process.env.LYZR_API_URL || "https://studio.lyzr.ai/inference/chat";

    if (!LYZR_API_KEY) return { text: "", parsedJson: null };

    try {
        const response = await fetch(LYZR_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": LYZR_API_KEY },
            body: JSON.stringify({
                user_id: "priceos-setup-system",
                agent_id: agentId,
                session_id: `setup-${Date.now()}`,
                message,
            }),
        });

        if (!response.ok) return { text: "", parsedJson: null };

        const data = await response.json();
        const rawStr =
            data.response?.message ||
            data.response?.result?.message ||
            data.response ||
            data.message ||
            "";

        let parsedJson = null;
        try {
            const jsonMatch = rawStr.match(/\{[\s\S]*\}/);
            if (jsonMatch) parsedJson = JSON.parse(jsonMatch[0]);
        } catch { /* ignore */ }

        return { text: rawStr, parsedJson };
    } catch (err) {
        console.error(`[callLyzrAgent] Error calling agent ${agentId}:`, err);
        return { text: "", parsedJson: null };
    }
}

export async function POST(req: NextRequest) {
    const startTime = Date.now();
    try {
        const body = await req.json();
        const { dateRange, context } = body;
        const listingId = context?.propertyId ? String(context.propertyId) : null;

        if (!dateRange?.from || !dateRange?.to) {
            return NextResponse.json({ error: "Date range is required" }, { status: 400 });
        }
        if (!listingId) {
            return NextResponse.json({ error: "Property ID is required" }, { status: 400 });
        }

        const session = await getSession();
        if (!session?.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await connectDB();
        const orgId = new mongoose.Types.ObjectId(session.orgId);
        const listing = await assertListingOwned(session.orgId, listingId);
        const listingObjectId = listing._id;

        console.log(`\n🚀 STARTING MARKET ANALYSIS FOR LISTING ${listingId}`);
        console.log(`📅 Date Range: ${dateRange.from} to ${dateRange.to}`);

        // 1. Fetch Property Context
        const city = listing?.city || "Dubai";
        const area = listing?.area || city;
        const bedrooms = resolveBedroomsNumber(listing?.bedroomsNumber, 1);
        const currency = listing?.currencyCode || "AED";
        console.log(
            `🏠 Property: "${listing?.name || "Unknown"}" in ${area}, ${city} (${bedroomsLabel(bedrooms)})`
        );

        try {
            await refreshListingCalendarFromHostaway(
                listingObjectId,
                new Date(dateRange.from),
                new Date(dateRange.to)
            );
        } catch (err) {
            console.warn("[market-setup] calendar refresh skipped:", (err as Error).message);
        }

        const calendarAvgPrice = await getCalendarAvgPrice(
            listingObjectId,
            dateRange.from,
            dateRange.to
        );
        const yourListingPrice =
            calendarAvgPrice > 0
                ? Math.round(calendarAvgPrice)
                : Number(listing?.price || 0);

        // 2a. Fetch Airbtics market context (ADR, seasonality, pacing)
        let airbticsMktCtx: Awaited<ReturnType<typeof getMarketContext>> | null = null;
        const countryCode = listing?.countryCode || "AE";
        try {
            const mktId = await resolveMarketId(city, countryCode);
            if (mktId) {
                airbticsMktCtx = await getMarketContext(mktId, String(bedrooms));
                console.log(`📊 Airbtics: p50ADR=${airbticsMktCtx.p50ADR} occ=${airbticsMktCtx.occupancy} pacing=${airbticsMktCtx.futurePacing.length}days metrics=${airbticsMktCtx.monthlyMetrics.length}mo ${airbticsMktCtx.errors.length ? `(errors: ${airbticsMktCtx.errors.join(", ")})` : ""}`);
            } else {
                console.log(`⚠️ Airbtics: no market found for ${city}/${countryCode}`);
            }
        } catch (err) {
            console.error(`[Airbtics]`, (err as Error).message);
        }

        // 2b. Gather VERIFIED market intelligence (SERP / Ticketmaster /
        //     Eventbrite / news). This is structured ground truth - the Lyzr
        //     agents receive it as input instead of being asked to invent
        //     events from memory.
        const dtcmStatus = await resolveDtcmEligibility(orgId);
        const intel = await gatherMarketIntelligence({
            city,
            area: area !== city ? area : undefined,
            countryCode,
            dateFrom: dateRange.from,
            dateTo: dateRange.to,
            enableDtcm: dtcmStatus.enabled,
        });
        if (dtcmStatus.enabled) {
            console.log(`🏛️ DTCM: ${dtcmStatus.reason}`);
        }
        console.log(`🔎 Verified intel: ${intel.findings.length} findings from [${intel.sourcesUsed.join(", ") || "none"}]`);
        console.log(`   Source breakdown:`, JSON.stringify(intel.sourceBreakdown));
        if (intel.sourceErrors.length) {
            console.log(`   Source errors:`, intel.sourceErrors.map((e) => `${e.source}: ${e.error}`).join("; "));
        }
        if (intel.findings.length === 0) {
            console.warn(
                `⚠️ No verified findings - check SERP_API_KEY / NEWS_API_KEY on Vercel. ` +
                `Agent will rely on Lyzr/Perplexity synthesis (higher hallucination risk).`
            );
        }

        const staticHolidays = getStaticHolidaysForWindow(
            countryCode,
            city,
            dateRange.from,
            dateRange.to
        );
        console.log(
            `📅 Static holidays in window: ${staticHolidays.length} (no Lyzr Marketing call)`
        );

        const airbticsHasBenchmark = Boolean(airbticsMktCtx?.p50ADR);
        let agentBench: Record<string, unknown> = {};

        if (!airbticsHasBenchmark) {
            const airbticsContext = "";
            const benchmarkPrompt = `City: ${city}. Area: ${area}. ${bedroomsLabel(bedrooms)}. Current calendar avg rate: ${yourListingPrice || "Unknown"} ${currency}. Date range: ${dateRange.from} to ${dateRange.to}.${airbticsContext}
Find 10-15 comparable short-term rental properties with the SAME bedroom count (${bedroomsLabel(bedrooms)}). Return JSON with rate_distribution (p25,p50,p75,p90,avg_weekday,avg_weekend), pricing_verdict (verdict,percentile,your_price), rate_trend (direction,pct_change), recommended_rates (weekday,weekend,event_peak,reasoning), comps array.`;

            const benchmarkRes = await callLyzrAgent(
                BENCHMARK_AGENT_ID || MARKET_RESEARCH_ID,
                benchmarkPrompt
            );
            agentBench = (benchmarkRes.parsedJson || {}) as Record<string, unknown>;
            console.log(`📉 Benchmark fallback: Lyzr agent (Airbtics unavailable)`);
        } else {
            console.log(`📉 Benchmark: Airbtics-first (p50=${airbticsMktCtx?.p50ADR}) - skipping Lyzr benchmark`);
        }

        console.log(`✅ Research complete. Verified: ${intel.findings.length}, Static holidays: ${staticHolidays.length}`);

        // 4. Save Market Events
        const verifiedSaved = await upsertVerifiedFindings({
            orgId,
            listingId: listingObjectId,
            city,
            listingArea: area !== city ? area : undefined,
            findings: intel.findings,
        });
        console.log(`📥 Saved ${verifiedSaved} verified market events`);

        // 4b. Static public holidays - deterministic calendar, no agent invention
        const verifiedNames = new Set(intel.findings.map((f) => f.title.toLowerCase().trim()));
        let holidaysSaved = 0;

        await Promise.all(
            staticHolidays.map(async (h) => {
                if (verifiedNames.has(h.title.toLowerCase().trim())) return;
                await MarketEvent.findOneAndUpdate(
                    { orgId, listingId: listingObjectId, name: h.title, startDate: h.dateStart },
                    {
                        $set: {
                            orgId,
                            listingId: listingObjectId,
                            name: h.title,
                            startDate: h.dateStart,
                            endDate: h.dateEnd,
                            area,
                            impactLevel: h.impact,
                            upliftPct: h.suggestedPremiumPct,
                            description: `[holiday] ${h.description}`,
                            source: "manual",
                            isActive: true,
                        },
                    },
                    { upsert: true }
                );
                holidaysSaved += 1;
            })
        );

        if (holidaysSaved > 0) {
            console.log(`📥 Saved ${holidaysSaved} public holidays (agent, certain only)`);
        }

        const allFindingsCount = verifiedSaved + holidaysSaved;

        // 4. Save Benchmark Data (upsert by listingId+dateFrom+dateTo)
        //    Airbtics monthly metrics provide real ADR percentiles - prefer them
        //    over LLM-estimated rates when available.
        const rateDist = agentBench?.rate_distribution as Record<string, number> | undefined;
        const pricingVerdict = agentBench?.pricing_verdict as Record<string, unknown> | undefined;
        const rateTrend = agentBench?.rate_trend as Record<string, unknown> | undefined;
        const recommendedRates = agentBench?.recommended_rates as Record<string, unknown> | undefined;
        const latestMetric = airbticsMktCtx?.monthlyMetrics?.[0];

        const airbticsP50 = airbticsMktCtx?.p50ADR;
        const medianRate =
            airbticsP50 ||
            rateDist?.p50 ||
            latestMetric?.p50_adr ||
            Number(listing?.price || 500);
        let p25Rate =
            latestMetric?.p25_adr ||
            rateDist?.p25 ||
            Math.round(medianRate * 0.85);
        let p50Rate = medianRate;
        let p75Rate =
            latestMetric?.p75_adr ||
            rateDist?.p75 ||
            Math.round(medianRate * 1.15);
        let p90Rate = rateDist?.p90 || Math.round(medianRate * 1.3);
        let benchmarkReasoning =
            (recommendedRates?.reasoning as string) ||
            (airbticsHasBenchmark
                ? `Benchmark anchored on Airbtics market p50 ADR (${medianRate} ${currency}).`
                : "Data synthesized from Lyzr benchmark fallback.");

        const sanity = assessBenchmarkSanity({
            p25: Number(p25Rate || 0),
            p50: Number(p50Rate || 0),
            p75: Number(p75Rate || 0),
            p90: Number(p90Rate || 0),
            currentPrice: yourListingPrice,
            bedrooms,
        });

        if (sanity.rejected) {
            try {
                const dubaiCtx = await buildDubaiMarketContext(area, city, bedrooms);
                const dubaiP50 =
                    dubaiCtx?.latestMonth?.p50Adr ?? dubaiCtx?.compPercentiles.p50 ?? null;
                if (dubaiP50 && dubaiP50 > 0) {
                    const dubaiSanity = assessBenchmarkSanity({
                        p25: dubaiCtx?.latestMonth?.p25Adr ?? dubaiCtx?.compPercentiles.p25 ?? dubaiP50 * 0.85,
                        p50: dubaiP50,
                        p75: dubaiCtx?.latestMonth?.p75Adr ?? dubaiCtx?.compPercentiles.p75 ?? dubaiP50 * 1.15,
                        currentPrice: yourListingPrice,
                        bedrooms,
                    });
                    if (dubaiSanity.trusted) {
                        p25Rate = dubaiSanity.p25;
                        p50Rate = dubaiSanity.p50;
                        p75Rate = dubaiSanity.p75;
                        p90Rate = dubaiSanity.p90;
                        benchmarkReasoning = `Dubai local comp set (${bedroomsLabel(bedrooms)}): p50=${p50Rate} ${currency}.`;
                        console.log(`📉 Benchmark corrected from Dubai local data: p50=${p50Rate}`);
                    } else {
                        p25Rate = sanity.p25;
                        p50Rate = sanity.p50;
                        p75Rate = sanity.p75;
                        p90Rate = sanity.p90;
                        benchmarkReasoning = sanity.reason ?? benchmarkReasoning;
                        console.warn(`📉 Benchmark rejected: ${sanity.reason}`);
                    }
                } else {
                    p25Rate = sanity.p25;
                    p50Rate = sanity.p50;
                    p75Rate = sanity.p75;
                    p90Rate = sanity.p90;
                    benchmarkReasoning = sanity.reason ?? benchmarkReasoning;
                    console.warn(`📉 Benchmark rejected: ${sanity.reason}`);
                }
            } catch (err) {
                p25Rate = sanity.p25;
                p50Rate = sanity.p50;
                p75Rate = sanity.p75;
                p90Rate = sanity.p90;
                benchmarkReasoning = sanity.reason ?? benchmarkReasoning;
                console.warn(`📉 Benchmark rejected: ${sanity.reason}`, (err as Error).message);
            }
        }

        const benchmarkDoc = {
            orgId,
            listingId: listingObjectId,
            dateFrom: dateRange.from,
            dateTo: dateRange.to,
            p25Rate,
            p50Rate,
            p75Rate,
            p90Rate,
            avgWeekday: rateDist?.avg_weekday || medianRate,
            avgWeekend: rateDist?.avg_weekend || Math.round(medianRate * 1.25),
            yourPrice: Number(pricingVerdict?.your_price) || yourListingPrice || medianRate,
            percentile: Number(pricingVerdict?.percentile) || 50,
            verdict: (pricingVerdict?.verdict as string) || "FAIR",
            rateTrend: (rateTrend?.direction as string) || "stable",
            trendPct: Number(rateTrend?.pct_change) || 0,
            recommendedWeekday: Number(recommendedRates?.weekday) || medianRate,
            recommendedWeekend: Number(recommendedRates?.weekend) || Math.round(medianRate * 1.2),
            recommendedEvent: Number(recommendedRates?.event_peak) || Math.round(medianRate * 1.5),
            reasoning: benchmarkReasoning,
            comps: (Array.isArray(agentBench?.comps) ? agentBench.comps : []).map((c: Record<string, unknown>) => ({
                name: c.name || "Unknown Listing",
                source: c.source || "Airbnb",
                sourceUrl: c.source_url || c.sourceUrl || null,
                rating: c.rating ?? null,
                reviews: c.reviews ?? null,
                avgRate: c.avg_nightly_rate || c.avgRate || 0,
                weekdayRate: c.weekday_rate || c.weekdayRate || null,
                weekendRate: c.weekend_rate || c.weekendRate || null,
                minRate: c.min_rate || c.minRate || null,
                maxRate: c.max_rate || c.maxRate || null,
            })),
        };

        await BenchmarkData.findOneAndUpdate(
            { listingId: listingObjectId, dateFrom: dateRange.from, dateTo: dateRange.to },
            { $set: benchmarkDoc },
            { upsert: true, new: true }
        );

        console.log(`📉 Benchmark saved. Verdict: ${benchmarkDoc.verdict}. Median: ${medianRate}. Comps: ${benchmarkDoc.comps.length}`);

        // 5. Auto-guardrails (if unset)
        let guardrailsSetByAi = false;
        let generatedGuardrails: any = null;

        if (Number(listing?.priceFloor || 0) === 0 && Number(listing?.priceCeiling || 0) === 0) {
            console.log(`🛡️ Guardrails unset. Invoking Guardrails Agent...`);
            const guardrailsPrompt = `Compute suggested_floor and suggested_ceiling for: ${JSON.stringify({ name: listing?.name, bedrooms, price: listing?.price })}. Benchmark p25=${benchmarkDoc.p25Rate} p50=${benchmarkDoc.p50Rate} p90=${benchmarkDoc.p90Rate}. Return JSON: {suggested_floor, suggested_ceiling, floor_reasoning, ceiling_reasoning}.`;

            const guardRes = await callLyzrAgent(
                GUARDRAILS_AGENT_ID || MARKET_RESEARCH_ID,
                guardrailsPrompt
            );
            const guardJson = guardRes.parsedJson || {};

            if (guardJson.suggested_floor && guardJson.suggested_ceiling) {
                await Listing.findByIdAndUpdate(listingObjectId, {
                    $set: {
                        priceFloor: Number(guardJson.suggested_floor),
                        floorReasoning: guardJson.floor_reasoning,
                        priceCeiling: Number(guardJson.suggested_ceiling),
                        ceilingReasoning: guardJson.ceiling_reasoning,
                        guardrailsSource: "ai",
                    },
                });
                guardrailsSetByAi = true;
                generatedGuardrails = {
                    floor: guardJson.suggested_floor,
                    ceiling: guardJson.suggested_ceiling,
                    floorReasoning: guardJson.floor_reasoning,
                    ceilingReasoning: guardJson.ceiling_reasoning,
                    source: "ai",
                };
                console.log(`🛡️ Auto-guardrails: Floor ${guardJson.suggested_floor}, Ceiling ${guardJson.suggested_ceiling}`);
            }
        }

        // 6. Fetch Calendar Metrics
        const [calMetrics] = await InventoryMaster.aggregate([
            {
                $match: {
                    listingId: listingObjectId,
                    date: { $gte: dateRange.from, $lte: dateRange.to },
                },
            },
            {
                $group: {
                    _id: null,
                    totalDays: { $sum: 1 },
                    bookedDays: { $sum: { $cond: [{ $eq: ["$status", "booked"] }, 1, 0] } },
                    availableDays: { $sum: { $cond: [{ $eq: ["$status", "available"] }, 1, 0] } },
                    blockedDays: { $sum: { $cond: [{ $eq: ["$status", "blocked"] }, 1, 0] } },
                    avgPrice: { $avg: "$currentPrice" },
                },
            },
        ]);

        // 7. Fetch Reservations
        const resRows = await Reservation.find({
            listingId: listingObjectId,
            checkIn: { $lte: dateRange.to },
            checkOut: { $gte: dateRange.from },
        }).lean();

        const totalDays = Number(calMetrics?.totalDays || 0);
        const bookedDays = Number(calMetrics?.bookedDays || 0);
        const blockedDays = Number(calMetrics?.blockedDays || 0);
        const bookableDays = totalDays - blockedDays;
        const occupancy = bookableDays > 0 ? Math.round((bookedDays / bookableDays) * 100) : 0;

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`\n✅ ANALYSIS COMPLETE in ${duration}s`);

        return NextResponse.json({
            success: true,
            eventsCount: allFindingsCount,
            verifiedEventsCount: intel.findings.length,
            holidaysCount: holidaysSaved,
            researchSourcesUsed: intel.sourcesUsed,
            researchSourceErrors: intel.sourceErrors,
            researchSourceBreakdown: intel.sourceBreakdown,
            holidaysSource: "static_calendar",
            benchmarkSource: airbticsHasBenchmark ? "airbtics" : "lyzr_fallback",
            dtcm: {
                enabled: dtcmStatus.enabled,
                reason: dtcmStatus.reason,
                hasApiKey: dtcmStatus.hasApiKey,
            },
            aiDetectedEventsCount: 0,
            duration: `${duration}s`,
            guardrailsSetByAi,
            guardrails: generatedGuardrails,
            calendarMetrics: { totalDays, bookedDays, blockedDays, bookableDays, occupancy },
            reservationsCount: resRows.length,
            airbtics: airbticsMktCtx ? {
                available: true,
                p50ADR: airbticsMktCtx.p50ADR,
                occupancy: airbticsMktCtx.occupancy,
                activeListings: airbticsMktCtx.activeListings,
                pacingDays: airbticsMktCtx.futurePacing.length,
                monthlyMetrics: airbticsMktCtx.monthlyMetrics.length,
                errors: airbticsMktCtx.errors,
            } : { available: false },
        });
    } catch (error) {
        if (error instanceof ListingAccessError) {
            return NextResponse.json({ error: error.message }, { status: 404 });
        }
        console.error("❌ Market Analysis failed:", error);
        return NextResponse.json(
            {
                error: "Market Analysis failed",
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 }
        );
    }
}

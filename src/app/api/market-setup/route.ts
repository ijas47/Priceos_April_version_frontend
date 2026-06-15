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
import {
    MARKET_RESEARCH_ID,
    PROPERTY_ANALYST_ID,
    MARKETING_AGENT_ID,
    BENCHMARK_AGENT_ID,
    GUARDRAILS_AGENT_ID,
} from "@/lib/agents/constants";
import { gatherMarketIntelligence } from "@/lib/research/aggregator";
import { upsertVerifiedFindings } from "@/lib/research/ensure-market-intel";
import { getMarketContext, resolveMarketId } from "@/lib/airbtics/market-context";
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

        await connectDB();
        const session = await getSession();
        const orgId = session?.orgId
            ? new mongoose.Types.ObjectId(session.orgId)
            : new mongoose.Types.ObjectId();

        const listingObjectId = new mongoose.Types.ObjectId(listingId);

        console.log(`\n🚀 STARTING MARKET ANALYSIS FOR LISTING ${listingId}`);
        console.log(`📅 Date Range: ${dateRange.from} to ${dateRange.to}`);

        // 1. Fetch Property Context
        const listing = await Listing.findById(listingObjectId).lean();
        const city = listing?.city || "Dubai";
        const area = listing?.area || city;
        const bedrooms = listing?.bedroomsNumber || 1;
        const currency = listing?.currencyCode || "AED";
        console.log(`🏠 Property: "${listing?.name || "Unknown"}" in ${area}, ${city} (${bedrooms}BR)`);

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
        //     Eventbrite / news). This is structured ground truth — the Lyzr
        //     agents receive it as input instead of being asked to invent
        //     events from memory.
        const intel = await gatherMarketIntelligence({
            city,
            area: area !== city ? area : undefined,
            dateFrom: dateRange.from,
            dateTo: dateRange.to,
        });
        console.log(`🔎 Verified intel: ${intel.findings.length} findings from [${intel.sourcesUsed.join(", ") || "none"}]`);
        console.log(`   Source breakdown:`, JSON.stringify(intel.sourceBreakdown));
        if (intel.sourceErrors.length) {
            console.log(`   Source errors:`, intel.sourceErrors.map((e) => `${e.source}: ${e.error}`).join("; "));
        }
        if (intel.findings.length === 0) {
            console.warn(
                `⚠️ No verified findings — check SERP_API_KEY / NEWS_API_KEY on Vercel. ` +
                `Agent will rely on Lyzr/Perplexity synthesis (higher hallucination risk).`
            );
        }

        const verifiedEventsJson = JSON.stringify(
            intel.findings.slice(0, 40).map((f) => ({
                title: f.title,
                date_start: f.dateStart,
                date_end: f.dateEnd,
                type: f.type,
                impact: f.impact,
                source: f.source,
                suggested_premium_pct: f.suggestedPremiumPct,
            }))
        );

        // 3. Build prompts — agents ASSESS verified data, they don't invent it.
        const currentDate = new Date().toISOString().split("T")[0];

        const marketingPrompt = `Today: ${currentDate}. City: ${city}. Date range: ${dateRange.from} to ${dateRange.to}.
VERIFIED_EVENTS (ground truth — already stored, do NOT duplicate): ${verifiedEventsJson}

Task: Return ONLY public/school holidays for ${city} that fall inside the date range and that you are CERTAIN of (e.g. national holidays with fixed or well-known dates).

STRICT RULES:
- Return JSON with a single key: "holidays" (array). No "events", "news", or "daily_events" keys.
- Do NOT invent concerts, conferences, festivals, Ramadan/Eid dates, or sporting events — those come from verified feeds only.
- If unsure of a holiday date, omit it.
- Each holiday: title, date_start (YYYY-MM-DD), date_end (YYYY-MM-DD), impact ("low"|"medium"|"high"), description, source ("public_holiday_calendar"), suggested_premium_pct (number).`;

        const airbticsContext = airbticsMktCtx?.p50ADR
            ? `\nAIRBTICS_MARKET_DATA (real, use as anchor):
  Market p50 ADR: ${airbticsMktCtx.p50ADR} ${currency}
  Market occupancy: ${airbticsMktCtx.occupancy != null ? (airbticsMktCtx.occupancy * 100).toFixed(0) + "%" : "N/A"}
  Active listings: ${airbticsMktCtx.activeListings ?? "N/A"}
  Monthly metrics (last 12mo): ${JSON.stringify(airbticsMktCtx.monthlyMetrics.slice(0, 12).map(m => ({ month: m.month, p25: m.p25_adr, p50: m.p50_adr, p75: m.p75_adr, occ: m.occupancy })))}`
            : "";

        const benchmarkPrompt = `City: ${city}. Area: ${area}. ${bedrooms}BR. Base price: ${listing?.price || "Unknown"} ${currency}. Date range: ${dateRange.from} to ${dateRange.to}.${airbticsContext}
Find 10-15 comparable short-term rental properties. Return JSON with rate_distribution (p25,p50,p75,p90,avg_weekday,avg_weekend), pricing_verdict (verdict,percentile,your_price), rate_trend (direction,pct_change), recommended_rates (weekday,weekend,event_peak,reasoning), comps array.`;

        const [marketingRes, benchmarkRes] = await Promise.all([
            callLyzrAgent(MARKETING_AGENT_ID || MARKET_RESEARCH_ID, marketingPrompt),
            callLyzrAgent(BENCHMARK_AGENT_ID || PROPERTY_ANALYST_ID, benchmarkPrompt),
        ]);

        const agentMkt = marketingRes.parsedJson || {};
        const agentBench = benchmarkRes.parsedJson || {};

        const holidayCount = Array.isArray(agentMkt?.holidays) ? agentMkt.holidays.length : 0;
        console.log(`✅ Research complete. Verified: ${intel.findings.length}, Agent holidays only: ${holidayCount}`);

        // 4. Save Market Events
        const verifiedSaved = await upsertVerifiedFindings({
            orgId,
            listingId: listingObjectId,
            area,
            findings: intel.findings,
        });
        console.log(`📥 Saved ${verifiedSaved} verified market events`);

        // 4b. Holidays only — never persist agent-invented events/news
        const verifiedNames = new Set(intel.findings.map((f) => f.title.toLowerCase().trim()));
        let holidaysSaved = 0;

        if (Array.isArray(agentMkt.holidays)) {
            await Promise.all(
                agentMkt.holidays.map(async (e: { title?: string; name?: string; date_start?: string; date?: string; date_end?: string; impact?: string; description?: string; suggested_premium_pct?: number }) => {
                    const name = e.title || e.name;
                    if (!name || verifiedNames.has(String(name).toLowerCase().trim())) return;
                    const start = e.date_start || e.date || dateRange.from;
                    const end = e.date_end || e.date || start;
                    if (start < dateRange.from || end > dateRange.to) return;
                    const impactRaw = (e.impact || "medium").toLowerCase();
                    const impactLevel = impactRaw.includes("high") ? "high" : impactRaw.includes("low") ? "low" : "medium";
                    await MarketEvent.findOneAndUpdate(
                        { orgId, listingId: listingObjectId, name, startDate: start },
                        {
                            $set: {
                                orgId,
                                listingId: listingObjectId,
                                name,
                                startDate: start,
                                endDate: end,
                                area,
                                impactLevel,
                                upliftPct: Number(e.suggested_premium_pct || 0),
                                description: `[holiday] ${e.description || ""}`,
                                source: "manual",
                                isActive: true,
                            },
                        },
                        { upsert: true }
                    );
                    holidaysSaved += 1;
                })
            );
        }

        if (holidaysSaved > 0) {
            console.log(`📥 Saved ${holidaysSaved} public holidays (agent, certain only)`);
        }

        const allFindingsCount = verifiedSaved + holidaysSaved;

        // 4. Save Benchmark Data (upsert by listingId+dateFrom+dateTo)
        //    Airbtics monthly metrics provide real ADR percentiles — prefer them
        //    over LLM-estimated rates when available.
        const airbticsP50 = airbticsMktCtx?.p50ADR;
        const medianRate = airbticsP50 || agentBench?.rate_distribution?.p50 || Number(listing?.price || 500);
        const benchmarkDoc = {
            orgId,
            listingId: listingObjectId,
            dateFrom: dateRange.from,
            dateTo: dateRange.to,
            p25Rate: agentBench?.rate_distribution?.p25 || Math.round(medianRate * 0.85),
            p50Rate: medianRate,
            p75Rate: agentBench?.rate_distribution?.p75 || Math.round(medianRate * 1.15),
            p90Rate: agentBench?.rate_distribution?.p90 || Math.round(medianRate * 1.3),
            avgWeekday: agentBench?.rate_distribution?.avg_weekday || medianRate,
            avgWeekend: agentBench?.rate_distribution?.avg_weekend || Math.round(medianRate * 1.25),
            yourPrice: agentBench?.pricing_verdict?.your_price || listing?.price || medianRate,
            percentile: agentBench?.pricing_verdict?.percentile || 50,
            verdict: agentBench?.pricing_verdict?.verdict || "FAIR",
            rateTrend: agentBench?.rate_trend?.direction || "stable",
            trendPct: agentBench?.rate_trend?.pct_change || 0,
            recommendedWeekday: agentBench?.recommended_rates?.weekday || medianRate,
            recommendedWeekend: agentBench?.recommended_rates?.weekend || Math.round(medianRate * 1.2),
            recommendedEvent: agentBench?.recommended_rates?.event_peak || Math.round(medianRate * 1.5),
            reasoning: agentBench?.recommended_rates?.reasoning || agentMkt?.summary || "Data synthesized from market search.",
            comps: (agentBench?.comps || []).map((c: any) => ({
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

import { NextRequest, NextResponse } from "next/server";
import { MANAGER_AGENT_ID } from "@/lib/agents/constants";
import { getJob } from "@/lib/jobs/store";
import {
    connectDB,
    ChatMessage,
    Listing,
    InventoryMaster,
    Reservation,
    MarketEvent,
    BenchmarkData,
    GuestSummary,
} from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { ensureVerifiedMarketIntel } from "@/lib/research/ensure-market-intel";
import {
    eventsOverlappingDate,
    getLowestTrustTier,
    UNVERIFIED_PREMIUM_CAP_PCT,
    UNVERIFIED_PREMIUM_REJECT_PCT,
    type MarketEventWindow,
} from "@/lib/research/source-trust";
import mongoose from "mongoose";

/**
 * POST /api/chat
 *
 * Unified chat API that:
 *   1. Fetches ALL property data fresh from MongoDB
 *   2. Injects it into the Lyzr prompt
 *   3. Sends the message to Lyzr and returns the response
 */

const LYZR_API_URL = process.env.LYZR_API_URL!;
const LYZR_API_KEY = process.env.LYZR_API_KEY!;
const AGENT_ID = process.env.AGENT_ID || MANAGER_AGENT_ID;

interface ChatContext {
    type: "portfolio" | "property";
    propertyId?: string;
    propertyName?: string;
    metrics?: {
        occupancy: number;
        bookedDays: number;
        availableDays: number;
        blockedDays: number;
        totalDays: number;
        bookableDays: number;
        avgPrice: number;
    };
}

interface ChatRequest {
    message: string;
    context: ChatContext;
    sessionId?: string;
    dateRange?: { from: string; to: string };
    isChatActive?: boolean;
}

export interface ChatResponsePayload {
    message: string;
    proposals?: unknown[];
    metadata?: unknown;
}

export const maxDuration = 300;

/** Poll async agent job status — GET /api/chat?jobId=... */
export async function GET(req: NextRequest) {
    try {
        const jobId = req.nextUrl.searchParams.get("jobId");
        if (!jobId) {
            return NextResponse.json({ error: "jobId is required" }, { status: 400 });
        }
        const job = await getJob(jobId);
        if (!job) {
            return NextResponse.json({ error: "Job not found" }, { status: 404 });
        }
        return NextResponse.json(job);
    } catch (error) {
        console.error("[chat GET]", error);
        return NextResponse.json({ error: "Failed to fetch job" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body: ChatRequest = await req.json();

        if (!body.message?.trim()) {
            return NextResponse.json({ error: "Message is required" }, { status: 400 });
        }
        if (!LYZR_API_KEY) {
            return NextResponse.json({ error: "LYZR_API_KEY not configured" }, { status: 500 });
        }
        if (!LYZR_API_URL) {
            return NextResponse.json({ error: "LYZR_API_URL not configured" }, { status: 500 });
        }
        if (!AGENT_ID) {
            return NextResponse.json({ error: "AGENT_ID not configured" }, { status: 500 });
        }

        const session = await getSession();
        if (!session?.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Run synchronously — Vercel serverless does not reliably finish
        // background work scheduled via after(), which left jobs stuck "running".
        const result = await runChat(body, session.orgId);
        return NextResponse.json(result);
    } catch (error) {
        console.error("[chat POST]", error);
        const message =
            error instanceof Error ? error.message : "Internal server error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

async function runChat(body: ChatRequest, orgIdStr: string): Promise<ChatResponsePayload> {
    const requestTimestamp = new Date().toISOString();
    const startTime = performance.now();

    try {
        const { message, context, sessionId, dateRange } = body;

        console.log(`\n${"═".repeat(60)}`);
        console.log(`📩 CHAT REQUEST — ${requestTimestamp}`);
        console.log(`${"═".repeat(60)}`);
        console.log(`  Context:  ${context.type} | Property: ${context.propertyName || "(portfolio)"}`);
        console.log(`  Range:    ${dateRange ? `${dateRange.from} → ${dateRange.to}` : "(none)"}`);
        console.log(`  Message:  "${message}"`);
        console.log(`${"─".repeat(60)}`);

        await connectDB();
        const orgId = new mongoose.Types.ObjectId(orgIdStr);

        const lyzrSessionId =
            sessionId ||
            (context.type === "portfolio"
                ? "portfolio-session"
                : `property-${context.propertyId}-${dateRange?.from || "start"}-${dateRange?.to || "end"}`);

        const isSystemMsg = message.startsWith("[SYSTEM]");

        // Check if this is the first real user message in this session
        const prevDataMsgs = await ChatMessage.find({
            sessionId: lyzrSessionId,
            role: "user",
            content: { $not: /^\[SYSTEM\]/ },
        })
            .limit(1)
            .lean();
        const needsDataInjection = prevDataMsgs.length === 0 && !isSystemMsg;

        let propertyDataPayload: any = null;
        let marketEventsForGuardrails: MarketEventWindow[] = [];

        if (needsDataInjection && context.type === "property" && context.propertyId) {
            const pid = context.propertyId;
            const dateFrom = dateRange?.from || "1970-01-01";
            const dateTo = dateRange?.to || "9999-12-31";

            let pidObjectId: mongoose.Types.ObjectId;
            try {
                pidObjectId = new mongoose.Types.ObjectId(pid);
            } catch {
                throw new Error("Invalid propertyId");
            }

            console.log(`\n🔄 [Context Sync] Fetching fresh data for listing ${pid}...`);

            const listing = await Listing.findById(pidObjectId).lean();
            if (!listing) throw new Error("Property not found");

            const intelRefresh = await ensureVerifiedMarketIntel({
                orgId,
                listingId: pidObjectId,
                city: listing.city || "Dubai",
                area: listing.area || listing.city || "Dubai",
                countryCode: listing.countryCode || "AE",
                dateFrom,
                dateTo,
            });
            if (intelRefresh.refreshed) {
                console.log(
                    `✅ [MarketIntel] Refreshed: ${intelRefresh.upsert?.verifiedCount ?? 0} findings ` +
                        `(${intelRefresh.assessment.reason})`
                );
            } else {
                console.log(`✅ [MarketIntel] Cache hit: ${intelRefresh.assessment.reason}`);
            }

            const eventScope = {
                orgId,
                $or: [
                    { listingId: pidObjectId },
                    { listingId: { $exists: false } },
                    { listingId: null },
                ],
                endDate: { $gte: dateFrom },
                startDate: { $lte: dateTo },
                isActive: true,
            };

            const [
                events,
                benchmark,
                calMetrics,
                resRows,
                guestSum,
                rawInventory,
            ] = await Promise.all([
                MarketEvent.find(eventScope).limit(50).lean(),
                BenchmarkData.findOne({
                    orgId,
                    listingId: pidObjectId,
                    dateFrom: { $lte: dateFrom },
                    dateTo: { $gte: dateTo },
                })
                    .sort({ createdAt: -1 })
                    .lean(),
                InventoryMaster.aggregate([
                    { $match: { listingId: pidObjectId, date: { $gte: dateFrom, $lte: dateTo } } },
                    {
                        $group: {
                            _id: null,
                            totalDays: { $sum: 1 },
                            bookedDays: {
                                $sum: { $cond: [{ $eq: ["$status", "booked"] }, 1, 0] },
                            },
                            availableDays: {
                                $sum: { $cond: [{ $eq: ["$status", "available"] }, 1, 0] },
                            },
                            blockedDays: {
                                $sum: { $cond: [{ $eq: ["$status", "blocked"] }, 1, 0] },
                            },
                            avgPrice: { $avg: "$currentPrice" },
                        },
                    },
                ]),
                Reservation.find({
                    listingId: pidObjectId,
                    checkIn: { $lte: dateTo },
                    checkOut: { $gte: dateFrom },
                }).lean(),
                GuestSummary.findOne({
                    listingId: pidObjectId,
                    dateTo: { $gte: dateFrom },
                    dateFrom: { $lte: dateTo },
                }).lean(),
                InventoryMaster.find({
                    listingId: pidObjectId,
                    date: { $gte: dateFrom, $lte: dateTo },
                })
                    .sort({ date: 1 })
                    .lean(),
            ]);

            const calResult = calMetrics[0];
            const uiMetrics = context.metrics;
            const usingUIMetrics = !!uiMetrics;

            const totalDays = uiMetrics?.totalDays ?? Number(calResult?.totalDays || 0);
            const bookedDays = uiMetrics?.bookedDays ?? Number(calResult?.bookedDays || 0);
            const blockedDays = uiMetrics?.blockedDays ?? Number(calResult?.blockedDays || 0);
            const bookableDays = uiMetrics?.bookableDays ?? totalDays - blockedDays;
            const occupancy =
                uiMetrics?.occupancy ??
                (bookableDays > 0 ? Math.round((bookedDays / bookableDays) * 100) : 0);
            const avgCalPrice =
                uiMetrics?.avgPrice ?? Number(calResult?.avgPrice || listing?.price || 0);

            const totalRevenue = resRows.reduce((s, r) => s + Number(r.totalPrice || 0), 0);
            const avgDailyRate =
                resRows.length > 0
                    ? resRows.reduce(
                          (s, r) =>
                              s + (r.nights > 0 ? r.totalPrice / r.nights : r.totalPrice),
                          0
                      ) / resRows.length
                    : Number(listing?.price || 0);
            const channelMix: Record<string, number> = {};
            resRows.forEach((r) => {
                const ch = r.channelName || "Direct";
                channelMix[ch] = (channelMix[ch] || 0) + 1;
            });

            console.log(
                `📦 [Context Sync] Metrics source: ${usingUIMetrics ? "✅ UI /calendar-metrics" : "⚠️  DB fallback"}`
            );
            console.log(
                `📦 [Context Sync] occ=${occupancy}% | booked=${bookedDays}d | bookings=${resRows.length}`
            );

            propertyDataPayload = {
                today: new Date().toISOString().split("T")[0],
                market_data_scanned_at: benchmark?.createdAt
                    ? new Date(benchmark.createdAt).toISOString()
                    : new Date().toISOString(),
                analysis_window: { from: dateFrom, to: dateTo },
                property: {
                    listingId: pid,
                    name: listing?.name || context.propertyName || "Unknown Property",
                    area: listing?.area || "Dubai",
                    city: listing?.city || "Dubai",
                    bedrooms: listing?.bedroomsNumber || 1,
                    bathrooms: listing?.bathroomsNumber || 1,
                    personCapacity: listing?.personCapacity || 0,
                    current_price: Number(listing?.price || 0),
                    floor_price: Number(listing?.priceFloor || 0),
                    ceiling_price: Number(listing?.priceCeiling || 0),
                    currency: listing?.currencyCode || "AED",
                },
                metrics: {
                    occupancy_pct: occupancy,
                    booked_nights: bookedDays,
                    bookable_nights: bookableDays,
                    blocked_nights: blockedDays,
                    total_nights: totalDays,
                    avg_nightly_rate: avgCalPrice,
                },
                benchmark: benchmark
                    ? {
                          verdict: benchmark.verdict || "FAIR",
                          percentile: benchmark.percentile || 50,
                          median_market_rate: Number(benchmark.p50Rate || 0),
                          p25: Number(benchmark.p25Rate || 0),
                          p50: Number(benchmark.p50Rate || 0),
                          p75: Number(benchmark.p75Rate || 0),
                          p90: Number(benchmark.p90Rate || 0),
                          avg_weekday: Number(benchmark.avgWeekday || 0),
                          avg_weekend: Number(benchmark.avgWeekend || 0),
                          recommended_weekday: Number(benchmark.recommendedWeekday || benchmark.p50Rate || 0),
                          recommended_weekend: Number(benchmark.recommendedWeekend || benchmark.p75Rate || 0),
                          recommended_event: Number(benchmark.recommendedEvent || benchmark.p90Rate || 0),
                          reasoning: benchmark.reasoning || "",
                      }
                    : null,
                market_intel: {
                    refreshed: intelRefresh.refreshed,
                    cache_reason: intelRefresh.assessment.reason,
                    verified_events_in_window: intelRefresh.assessment.verifiedEventCount,
                },
                market_events: events.map((e) => ({
                    title: e.name,
                    start_date: e.startDate,
                    end_date: e.endDate,
                    impact: e.impactLevel,
                    source: e.source,
                    description: e.description || "",
                    suggested_premium_pct: e.upliftPct || 0,
                })),
                demand_outlook: {
                    trend: "moderate",
                    reason: "Aggregated from market intelligence.",
                    negative_factors: [],
                    positive_factors: [],
                },
                available_dates: rawInventory
                    .filter((inv) => inv.status !== "blocked" && inv.status !== "booked")
                    .map((inv) => ({
                        date: inv.date,
                        current_price: Number(inv.currentPrice || listing?.price || 0),
                        status: inv.status || "available",
                        min_stay: inv.minStay || 1,
                    })),
                date_classifications: rawInventory.map((inv) => ({
                    date: inv.date,
                    status: inv.status || "available",
                    current_price: Number(inv.currentPrice || listing?.price || 0),
                    is_weekend: [5, 6].includes(new Date(inv.date).getDay()),
                })),
                recent_reservations: resRows.map((r) => ({
                    guestName: r.guestName || "Guest",
                    startDate: r.checkIn,
                    endDate: r.checkOut,
                    nights: r.nights,
                    totalPrice: Number(r.totalPrice || 0),
                    channel: r.channelName || "Direct",
                })),
            };

            marketEventsForGuardrails = propertyDataPayload.market_events;
            console.log(`✅ [Context Sync] Payload ready for injection.`);
        }

        // Save user message
        try {
            if (message?.trim()) {
                await ChatMessage.create({
                    orgId,
                    sessionId: lyzrSessionId,
                    role: "user",
                    content: message,
                    context:
                        context.type === "property" && context.propertyId
                            ? {
                                  type: "property",
                                  propertyId: new mongoose.Types.ObjectId(context.propertyId),
                              }
                            : { type: "portfolio" },
                    metadata: { context, dateRange },
                });
            }
        } catch (err) {
            console.error("Failed to save user message to DB:", err);
        }

        // Build anchored message with strict temporal grounding
        const today = new Date().toISOString().split("T")[0];
        const windowFrom = dateRange?.from ?? today;
        const windowTo = dateRange?.to ?? windowFrom;
        const temporalRules = [
            `[TEMPORAL GROUNDING — MANDATORY]`,
            `Today's date: ${today}`,
            `Analysis window: ${windowFrom} → ${windowTo}`,
            `Only cite events from market_events whose start_date/end_date overlap this window.`,
            `Never mention seasonal events (e.g. Ramadan, Eid, F1) unless they fall inside the analysis window per the injected data.`,
            `If no overlapping event exists in market_events, write "No major events in this period" — do not invent events.`,
        ].join("\n");

        let anchoredMessage = message;
        if (!isSystemMsg) {
            if (propertyDataPayload) {
                anchoredMessage = `${temporalRules}\n\n[SYSTEM: CURRENT PROPERTY DATA]\nYou must strictly use the following real-time data to answer the user's query:\n${JSON.stringify(propertyDataPayload, null, 2)}\n[/SYSTEM]\n\nUser Message:\n${message}`;
            } else {
                const propName = context.propertyName || "portfolio";
                anchoredMessage = `${temporalRules}\n\n[Active Context: ${propName}]\n\n${message}`;
            }
        }

        const payload = {
            user_id: "priceos-user",
            agent_id: AGENT_ID,
            session_id: lyzrSessionId,
            message: anchoredMessage,
        };

        const maskedKey =
            LYZR_API_KEY.length > 8
                ? `${LYZR_API_KEY.slice(0, 4)}...${LYZR_API_KEY.slice(-4)}`
                : "****";

        console.log(`\n📤 LYZR CHAT REQUEST`);
        console.log(`${"─".repeat(60)}`);
        console.log(`  Agent:    ${AGENT_ID}  |  Session: ${lyzrSessionId}`);
        console.log(`  API Key:  ${maskedKey}  |  URL: ${LYZR_API_URL}`);
        console.log(`  Message:  "${message}"`);
        console.log(`${"─".repeat(60)}`);

        const response = await fetch(LYZR_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": LYZR_API_KEY },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const rawText = await response.text();
            console.error(`\n❌ LYZR API ERROR — ${response.status}: ${rawText.substring(0, 300)}`);
            throw new Error("AI agent is temporarily unavailable. Please try again.");
        }

        const data = await response.json();
        const duration = Math.round(performance.now() - startTime);
        const { text: agentReply, parsedJson } = extractAgentMessage(data);

        // Server-side guardrails
        const floorPrice = Number(propertyDataPayload?.property?.floor_price || 0);
        const ceilingPrice = Number(propertyDataPayload?.property?.ceiling_price || 0);
        let enforcedProposals = parsedJson?.proposals || null;

        if (
            enforcedProposals &&
            Array.isArray(enforcedProposals) &&
            (floorPrice > 0 || ceilingPrice > 0)
        ) {
            enforcedProposals = enforceGuardrails(
                enforcedProposals,
                floorPrice,
                ceilingPrice,
                marketEventsForGuardrails
            );
            console.log(
                `🛡️ [Guardrails] Enforced floor=${floorPrice} ceiling=${ceilingPrice} on ${enforcedProposals.length} proposals`
            );
        }

        // Save assistant reply
        try {
            if (agentReply) {
                await ChatMessage.create({
                    orgId,
                    sessionId: lyzrSessionId,
                    role: "assistant",
                    content: agentReply,
                    context:
                        context.type === "property" && context.propertyId
                            ? {
                                  type: "property",
                                  propertyId: new mongoose.Types.ObjectId(context.propertyId),
                              }
                            : { type: "portfolio" },
                    metadata: { context, dateRange, proposals: enforcedProposals },
                });
                console.log(`\n✅ AGENT REPLY SAVED — ${duration}ms`);
            }
        } catch (err) {
            console.error("Failed to save assistant reply to DB:", err);
        }

        return {
            message: agentReply || "No message received from agent",
            proposals: enforcedProposals ?? undefined,
        };
    } catch (error) {
        const duration = Math.round(performance.now() - startTime);
        console.error(
            `\n💥 UNHANDLED ERROR — ${duration}ms:`,
            error instanceof Error ? error.message : error
        );
        if (error instanceof Error) throw error;
        throw new Error("Sorry, something went wrong. Please try again.");
    }
}

function extractAgentMessage(response: any): { text: string; parsedJson: any | null } {
    let rawStr = "";
    if (typeof response.response === "string") rawStr = response.response;
    else if (response.response?.message) rawStr = response.response.message;
    else if (response.response?.result?.message) rawStr = response.response.result.message;
    else if (response.response?.result?.text) rawStr = response.response.result.text;
    else if (response.response?.result?.answer) rawStr = response.response.result.answer;
    else if (typeof response.message === "string") rawStr = response.message;
    else if (response.choices?.[0]?.message?.content) rawStr = response.choices[0].message.content;
    else if (typeof response.result === "string") rawStr = response.result;

    if (!rawStr) {
        console.warn("[Chat API] Unknown Lyzr response format:", JSON.stringify(response).substring(0, 500));
        return { text: "I received your message but couldn't parse my response. Please try again.", parsedJson: null };
    }

    let cleanStr = rawStr;
    if (cleanStr.startsWith("```json")) {
        cleanStr = cleanStr.replace(/```json\s*/, "").replace(/\s*```$/, "");
    }

    try {
        const parsed = JSON.parse(cleanStr);
        console.log(`\n🤖 LYZR AGENT PARSED JSON:`);
        console.dir(parsed, { depth: null, colors: true });
        if (parsed.chat_response) return { text: parsed.chat_response, parsedJson: parsed };
        if (parsed.summary) return { text: parsed.summary, parsedJson: parsed };
        return { text: "```json\n" + JSON.stringify(parsed, null, 2) + "\n```", parsedJson: parsed };
    } catch {
        console.log(`\n🤖 LYZR AGENT RAW TEXT:`);
        console.log(rawStr);
        return { text: rawStr, parsedJson: null };
    }
}

function enforceGuardrails(
    proposals: any[],
    floorPrice: number,
    ceilingPrice: number,
    marketEvents: MarketEventWindow[] = []
): any[] {
    return proposals.map((p) => {
        const currentPrice = Number(p.current_price || p.currentPrice || 0);
        let proposedPrice = Number(p.proposed_price || p.proposedPrice || 0);
        let verdict = p.guard_verdict || p.guardVerdict || "APPROVED";
        const notes: string[] = [];

        if (floorPrice > 0 && proposedPrice < floorPrice) {
            notes.push(`Server clamped ${proposedPrice} → floor ${floorPrice}`);
            proposedPrice = floorPrice;
        }
        if (ceilingPrice > 0 && proposedPrice > ceilingPrice) {
            notes.push(`Server clamped ${proposedPrice} → ceiling ${ceilingPrice}`);
            proposedPrice = ceilingPrice;
        }

        let changePct =
            currentPrice > 0 ? Math.round(((proposedPrice - currentPrice) / currentPrice) * 100) : 0;

        const proposalDate = String(p.date || p.proposal_date || "");
        const dayEvents = proposalDate ? eventsOverlappingDate(proposalDate, marketEvents) : [];
        const eventSources = dayEvents.map((e) => e.source);
        const lowestTrust = getLowestTrustTier(eventSources);
        const maxVerifiedPremium = dayEvents.reduce(
            (max, e) => Math.max(max, Number(e.suggested_premium_pct || 0)),
            0
        );

        const reasoning = p.reasoning;
        const citesEventSignal =
            dayEvents.length > 0 ||
            (typeof reasoning === "object" &&
                reasoning &&
                Boolean(
                    (reasoning as Record<string, string>).reason_event ||
                        (reasoning as Record<string, string>).reason_news
                ));

        if (citesEventSignal && lowestTrust <= 0 && changePct > UNVERIFIED_PREMIUM_REJECT_PCT) {
            verdict = "REJECTED";
            notes.push(
                `Event-driven +${changePct}% rejected — only unverified sources (ai_detected/perplexity) for ${proposalDate}`
            );
        } else if (citesEventSignal && lowestTrust <= 0 && changePct > UNVERIFIED_PREMIUM_CAP_PCT) {
            const cappedPrice = Math.round(currentPrice * (1 + UNVERIFIED_PREMIUM_CAP_PCT / 100));
            notes.push(
                `Capped unverified event premium ${changePct}% → ${UNVERIFIED_PREMIUM_CAP_PCT}% (no verified feed)`
            );
            proposedPrice = Math.min(proposedPrice, cappedPrice);
            if (verdict === "APPROVED") verdict = "FLAGGED";
            changePct =
                currentPrice > 0
                    ? Math.round(((proposedPrice - currentPrice) / currentPrice) * 100)
                    : 0;
        } else if (
            citesEventSignal &&
            lowestTrust >= 2 &&
            maxVerifiedPremium > 0 &&
            changePct > maxVerifiedPremium + 10
        ) {
            const cappedPrice = Math.round(currentPrice * (1 + (maxVerifiedPremium + 5) / 100));
            notes.push(
                `Capped event premium ${changePct}% → verified ceiling ${maxVerifiedPremium + 5}%`
            );
            proposedPrice = Math.min(proposedPrice, cappedPrice);
            if (verdict === "APPROVED") verdict = "FLAGGED";
            changePct =
                currentPrice > 0
                    ? Math.round(((proposedPrice - currentPrice) / currentPrice) * 100)
                    : 0;
        }

        if (Math.abs(changePct) > 50) {
            verdict = "REJECTED";
            notes.push(`Swing ${changePct}% exceeds ±50% limit`);
        }

        const absChange = Math.abs(changePct);
        const riskLevel = absChange < 5 ? "low" : absChange <= 15 ? "medium" : "high";

        return {
            ...p,
            proposed_price: proposedPrice,
            proposedPrice,
            change_pct: changePct,
            changePct,
            risk_level: riskLevel,
            riskLevel,
            guard_verdict: verdict,
            guardVerdict: verdict,
            ...(dayEvents.length > 0
                ? {
                      event_trust_tier: lowestTrust,
                      event_sources: eventSources,
                  }
                : {}),
            ...(notes.length > 0 ? { server_notes: notes.join("; ") } : {}),
        };
    });
}

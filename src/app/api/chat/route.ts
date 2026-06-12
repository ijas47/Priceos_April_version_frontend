import { NextRequest, NextResponse } from "next/server";
import { MANAGER_AGENT_ID } from "@/lib/agents/constants";
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

export async function POST(req: NextRequest) {
    const requestTimestamp = new Date().toISOString();
    const startTime = performance.now();

    try {
        const body: ChatRequest = await req.json();
        const { message, context, sessionId, dateRange } = body;

        console.log(`\n${"═".repeat(60)}`);
        console.log(`📩 CHAT REQUEST — ${requestTimestamp}`);
        console.log(`${"═".repeat(60)}`);
        console.log(`  Context:  ${context.type} | Property: ${context.propertyName || "(portfolio)"}`);
        console.log(`  Range:    ${dateRange ? `${dateRange.from} → ${dateRange.to}` : "(none)"}`);
        console.log(`  Message:  "${message}"`);
        console.log(`${"─".repeat(60)}`);

        if (!message?.trim()) {
            return NextResponse.json({ error: "Message is required" }, { status: 400 });
        }
        if (!LYZR_API_KEY) {
            return NextResponse.json({ error: "LYZR_API_KEY not configured" }, { status: 500 });
        }
        if (!AGENT_ID) {
            return NextResponse.json({ error: "AGENT_ID not configured" }, { status: 500 });
        }

        await connectDB();
        const session = await getSession();
        const orgId = session?.orgId
            ? new mongoose.Types.ObjectId(session.orgId)
            : new mongoose.Types.ObjectId();

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

        if (needsDataInjection && context.type === "property" && context.propertyId) {
            const pid = context.propertyId;
            const dateFrom = dateRange?.from || "1970-01-01";
            const dateTo = dateRange?.to || "9999-12-31";

            let pidObjectId: mongoose.Types.ObjectId;
            try {
                pidObjectId = new mongoose.Types.ObjectId(pid);
            } catch {
                return NextResponse.json({ error: "Invalid propertyId" }, { status: 400 });
            }

            console.log(`\n🔄 [Context Sync] Fetching fresh data for listing ${pid}...`);

            const [
                listing,
                events,
                benchmark,
                calMetrics,
                resRows,
                guestSum,
                rawInventory,
            ] = await Promise.all([
                Listing.findById(pidObjectId).lean(),
                MarketEvent.find({
                    endDate: { $gte: dateFrom },
                    startDate: { $lte: dateTo },
                    isActive: true,
                })
                    .limit(50)
                    .lean(),
                BenchmarkData.findOne({
                    listingId: pidObjectId,
                    dateTo: { $gte: dateFrom },
                    dateFrom: { $lte: dateTo },
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
                market_events: events.map((e) => ({
                    title: e.name,
                    start_date: e.startDate,
                    end_date: e.endDate,
                    impact: e.impactLevel,
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

        // Build anchored message
        let anchoredMessage = message;
        if (!isSystemMsg) {
            if (propertyDataPayload) {
                anchoredMessage = `[SYSTEM: CURRENT PROPERTY DATA]\nYou must strictly use the following real-time data to answer the user's query:\n${JSON.stringify(propertyDataPayload, null, 2)}\n[/SYSTEM]\n\nUser Message:\n${message}`;
            } else {
                const propName = context.propertyName || "portfolio";
                anchoredMessage = `[Active Context: ${propName}]\n\n${message}`;
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
            return NextResponse.json(
                {
                    message: "I'm having trouble connecting to the AI agent. Please try again.",
                    error: `Lyzr API returned ${response.status}`,
                },
                { status: 502 }
            );
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
            enforcedProposals = enforceGuardrails(enforcedProposals, floorPrice, ceilingPrice);
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

        return NextResponse.json({
            message: agentReply || "No message received from agent",
            proposals: enforcedProposals,
        });
    } catch (error) {
        const duration = Math.round(performance.now() - startTime);
        console.error(
            `\n💥 UNHANDLED ERROR — ${duration}ms:`,
            error instanceof Error ? error.message : error
        );
        return NextResponse.json(
            {
                message: "Sorry, something went wrong. Please try again.",
                error: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 }
        );
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

function enforceGuardrails(proposals: any[], floorPrice: number, ceilingPrice: number): any[] {
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

        const changePct =
            currentPrice > 0 ? Math.round(((proposedPrice - currentPrice) / currentPrice) * 100) : 0;

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
            ...(notes.length > 0 ? { server_notes: notes.join("; ") } : {}),
        };
    });
}

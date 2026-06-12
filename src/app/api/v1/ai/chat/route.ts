import {
    connectDB,
    ChatMessage,
    InventoryMaster,
    Reservation,
    MarketEvent,
    BenchmarkData,
    Listing,
} from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { apiSuccess, apiError } from "@/lib/api/response";
import { chatRequestSchema, formatZodErrors } from "@/lib/validators";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/api/rate-limit";
import { CRO_ROUTER_AGENT_ID } from "@/lib/agents/constants";
import mongoose from "mongoose";

const LYZR_API_URL = process.env.LYZR_API_URL || "https://agent-prod.studio.lyzr.ai/v3/inference/chat/";
const LYZR_API_KEY = process.env.LYZR_API_KEY!;
const AGENT_ID = process.env.AGENT_ID || CRO_ROUTER_AGENT_ID;

export async function POST(req: Request) {
    const ip = getClientIp(req);

    const rateCheck = checkRateLimit(`ai-chat:${ip}`, RATE_LIMITS.ai);
    if (!rateCheck.allowed) {
        return apiError("RATE_LIMITED", `AI chat limit reached. Try again in ${Math.ceil(rateCheck.resetMs / 1000)}s.`, 429);
    }

    try {
        const body: any = await req.json();
        const validation = chatRequestSchema.safeParse(body);

        if (!validation.success) {
            return apiError("VALIDATION_ERROR", "Invalid chat request", 400, formatZodErrors(validation.error));
        }

        const { message, context, sessionId, dateRange } = validation.data;

        if (!LYZR_API_KEY) {
            return apiError("CONFIG_ERROR", "LYZR_API_KEY not configured", 500);
        }

        await connectDB();

        const session = await getSession();
        const orgId = session?.orgId
            ? new mongoose.Types.ObjectId(session.orgId)
            : new mongoose.Types.ObjectId();

        const lyzrSessionId = sessionId || (
            context.type === "portfolio"
                ? "portfolio-session"
                : `property-${context.propertyId}-${dateRange?.from || "start"}-${dateRange?.to || "end"}`
        );

        const isSystemMsg = message.startsWith("[SYSTEM]");

        // Check if data injection is needed
        const prevDataMsgs = await ChatMessage.find({
            orgId,
            sessionId: lyzrSessionId,
            role: "user",
            content: { $not: /^\[SYSTEM\]/ },
        }).limit(1).lean();

        const needsDataInjection = prevDataMsgs.length === 0 && !isSystemMsg;

        let propertyDataPayload: any = null;

        if (needsDataInjection && context.type === "property" && context.propertyId) {
            const pid = new mongoose.Types.ObjectId(String(context.propertyId));
            const dateFrom = dateRange?.from || '1970-01-01';
            const dateTo = dateRange?.to || '9999-12-31';

            const [listing, , benchmarkDoc] = await Promise.all([
                Listing.findById(pid).lean(),
                MarketEvent.find({ listingId: pid, endDate: { $gte: dateFrom }, startDate: { $lte: dateTo } }).limit(50).lean(),
                BenchmarkData.findOne({ listingId: pid, dateTo: { $gte: dateFrom }, dateFrom: { $lte: dateTo } }).lean(),
                Reservation.find({ listingId: pid, checkOut: { $gte: dateFrom }, checkIn: { $lte: dateTo } }).lean(),
                InventoryMaster.find({ listingId: pid, date: { $gte: dateFrom, $lte: dateTo } }).lean(),
            ]);

            const [calResult] = await InventoryMaster.aggregate([
                { $match: { listingId: pid, date: { $gte: dateFrom, $lte: dateTo } } },
                {
                    $group: {
                        _id: null,
                        totalDays: { $sum: 1 },
                        bookedDays: { $sum: { $cond: [{ $in: ["$status", ["booked", "reserved"]] }, 1, 0] } },
                        availableDays: { $sum: { $cond: [{ $eq: ["$status", "available"] }, 1, 0] } },
                        blockedDays: { $sum: { $cond: [{ $eq: ["$status", "blocked"] }, 1, 0] } },
                        avgPrice: { $avg: "$currentPrice" },
                    },
                },
            ]);

            const uiMetrics = context.metrics;
            const totalDays = uiMetrics?.totalDays ?? Number(calResult?.totalDays || 0);
            const bookedDays = uiMetrics?.bookedDays ?? Number(calResult?.bookedDays || 0);
            const blockedDays = uiMetrics?.blockedDays ?? Number(calResult?.blockedDays || 0);
            const bookableDays = uiMetrics?.bookableDays ?? (totalDays - blockedDays);
            const occupancy = uiMetrics?.occupancy ?? (bookableDays > 0 ? Math.round((bookedDays / bookableDays) * 100) : 0);
            const avgCalPrice = uiMetrics?.avgPrice ?? Number(calResult?.avgPrice || listing?.price || 0);

            propertyDataPayload = {
                today: new Date().toISOString().split('T')[0],
                analysis_window: { from: dateFrom, to: dateTo },
                property: {
                    listingId: pid.toString(),
                    name: listing?.name || context.propertyName || "Property",
                    bedrooms: listing?.bedroomsNumber || 1,
                    current_price: Number(listing?.price || 0),
                    floor_price: Number(listing?.priceFloor || 0),
                    ceiling_price: Number(listing?.priceCeiling || 0),
                },
                metrics: {
                    occupancy_pct: occupancy,
                    booked_nights: bookedDays,
                    avg_nightly_rate: avgCalPrice,
                },
                benchmark: benchmarkDoc
                    ? { verdict: benchmarkDoc.verdict, percentile: benchmarkDoc.percentile, p50: benchmarkDoc.p50Rate }
                    : null,
            };
        }

        // Save user message
        await ChatMessage.create({
            orgId,
            sessionId: lyzrSessionId,
            role: "user",
            content: message,
            context: {
                type: context.type,
                propertyId: context.propertyId
                    ? new mongoose.Types.ObjectId(String(context.propertyId))
                    : undefined,
            },
            metadata: { context, dateRange },
        });

        let anchoredMessage = message;
        if (!isSystemMsg && propertyDataPayload) {
            anchoredMessage = `[SYSTEM: CURRENT PROPERTY DATA]\n${JSON.stringify(propertyDataPayload, null, 2)}\n[/SYSTEM]\n\nUser Message:\n${message}`;
        }

        const lyzrRes = await fetch(LYZR_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": LYZR_API_KEY },
            body: JSON.stringify({
                user_id: "priceos-user",
                agent_id: AGENT_ID,
                session_id: lyzrSessionId,
                message: anchoredMessage,
            }),
        });

        if (!lyzrRes.ok) {
            return apiError("AI_SERVICE_ERROR", "Failed to connect to Lyzr Agent", 502);
        }

        const lyzrData = await lyzrRes.json();
        const { text: agentReply, parsedJson } = extractAgentMessage(lyzrData);

        // Apply Guardrails
        const floorPrice = Number(propertyDataPayload?.property?.floor_price || 0);
        const ceilingPrice = Number(propertyDataPayload?.property?.ceiling_price || 0);
        let proposals = parsedJson?.proposals || null;
        if (proposals && Array.isArray(proposals) && (floorPrice > 0 || ceilingPrice > 0)) {
            proposals = enforceGuardrails(proposals, floorPrice, ceilingPrice);
        }

        // Save assistant reply
        await ChatMessage.create({
            orgId,
            sessionId: lyzrSessionId,
            role: "assistant",
            content: agentReply,
            context: {
                type: context.type,
                propertyId: context.propertyId
                    ? new mongoose.Types.ObjectId(String(context.propertyId))
                    : undefined,
            },
            metadata: { context, dateRange, proposals },
        });

        return apiSuccess({ message: agentReply, proposals });

    } catch (error: any) {
        console.error("❌ [v1/ai/chat POST] Error:", error);
        return apiError("INTERNAL_ERROR", error.message || "Failed to process chat", 500);
    }
}

function extractAgentMessage(response: any): { text: string; parsedJson: any | null } {
    let rawStr = response.response || response.message || "";
    if (typeof rawStr !== "string") {
        rawStr = response.response?.message || response.response?.result?.message || JSON.stringify(rawStr);
    }

    const cleanStr = rawStr.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    try {
        const jsonMatch = cleanStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return { text: parsed.chat_response || parsed.summary || rawStr, parsedJson: parsed };
        }
        return { text: rawStr, parsedJson: null };
    } catch {
        return { text: rawStr, parsedJson: null };
    }
}

function enforceGuardrails(proposals: any[], floor: number, ceiling: number): any[] {
    return proposals.map(p => {
        let price = Number(p.proposed_price || 0);
        if (floor > 0 && price < floor) price = floor;
        if (ceiling > 0 && price > ceiling) price = ceiling;
        return { ...p, proposed_price: price, guard_verdict: "APPROVED" };
    });
}

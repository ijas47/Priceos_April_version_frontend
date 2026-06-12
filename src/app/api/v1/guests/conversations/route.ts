import { connectDB, HostawayConversation } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api/response";
import { getConversationsSchema, formatZodErrors } from "@/lib/validators";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/api/rate-limit";
import mongoose from "mongoose";

export async function GET(request: Request) {
    const ip = getClientIp(request);
    const rateCheck = checkRateLimit(`guests-conversations:${ip}`, RATE_LIMITS.standard);
    if (!rateCheck.allowed) {
        return apiError("RATE_LIMITED", `Too many requests. Try again in ${Math.ceil(rateCheck.resetMs / 1000)}s.`, 429);
    }

    const { searchParams } = new URL(request.url);

    const validation = getConversationsSchema.safeParse({
        listingId: searchParams.get("listingId") || "",
        from: searchParams.get("from") || "",
        to: searchParams.get("to") || "",
    });

    if (!validation.success) {
        return apiError("VALIDATION_ERROR", "Invalid query parameters", 400, formatZodErrors(validation.error));
    }

    const { listingId, from: dateFrom, to: dateTo } = validation.data;

    try {
        await connectDB();

        const listingObjectId = new mongoose.Types.ObjectId(String(listingId));

        const rows = await HostawayConversation.find({
            listingId: listingObjectId,
            dateFrom: { $lte: dateTo },
            dateTo: { $gte: dateFrom },
        }).lean();

        if (rows.length === 0) {
            return apiSuccess({ conversations: [], count: 0, cached: true });
        }

        // Deduplicate by hostawayConversationId
        const uniqueRowsMap = new Map<string, typeof rows[0]>();
        for (const row of rows) {
            if (!uniqueRowsMap.has(row.hostawayConversationId)) {
                uniqueRowsMap.set(row.hostawayConversationId, row);
            }
        }
        const uniqueRows = Array.from(uniqueRowsMap.values());

        const conversations = uniqueRows.map((conv) => {
            const dbMessages = conv.messages as { sender: string; text: string; timestamp: string }[];

            const allMessages = dbMessages.map((m, idx) => ({
                id: `${conv.hostawayConversationId}_${idx}`,
                sender: m.sender as "guest" | "admin",
                text: m.text,
                time: m.timestamp
                    ? new Date(m.timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
                    : "",
                _ts: m.timestamp ? new Date(m.timestamp).getTime() : idx,
            })).sort((a, b) => a._ts - b._ts);

            const lastMsg = allMessages[allMessages.length - 1];

            return {
                id: conv.hostawayConversationId,
                guestName: conv.guestName,
                lastMessage: lastMsg?.text || "No messages",
                status: lastMsg?.sender === "guest" ? "needs_reply" : "resolved",
                messages: allMessages.map(({ _ts, ...rest }) => rest),
            };
        });

        return apiSuccess({ conversations, count: conversations.length, cached: true });
    } catch (error) {
        console.error("❌ [v1/guests/conversations] Error:", error);
        return apiError("INTERNAL_ERROR", "Failed to load guest conversations", 500);
    }
}

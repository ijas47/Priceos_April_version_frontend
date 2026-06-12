import { connectDB, HostawayConversation } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api/response";
import { guestReplySchema, formatZodErrors } from "@/lib/validators";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/api/rate-limit";

/**
 * POST /api/v1/guests/reply
 *
 * Appends an admin reply to the conversation messages array.
 * This does NOT send to Hostaway — stored locally for AI context.
 */
export async function POST(request: Request) {
    const ip = getClientIp(request);
    const rateCheck = checkRateLimit(`guests-reply:${ip}`, RATE_LIMITS.standard);
    if (!rateCheck.allowed) {
        return apiError("RATE_LIMITED", `Too many requests. Try again in ${Math.ceil(rateCheck.resetMs / 1000)}s.`, 429);
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return apiError("PARSE_ERROR", "Request body must be valid JSON", 400);
    }

    const validation = guestReplySchema.safeParse(body);
    if (!validation.success) {
        return apiError("VALIDATION_ERROR", "Invalid request body", 400, formatZodErrors(validation.error));
    }

    const { conversationId, text } = validation.data;

    try {
        await connectDB();

        console.log(`📥 [v1/guests/reply] Saving reply for conversation: ${conversationId}`);

        await HostawayConversation.findOneAndUpdate(
            { hostawayConversationId: conversationId },
            {
                $push: {
                    messages: {
                        sender: "admin",
                        text,
                        timestamp: new Date().toISOString(),
                    },
                },
            }
        );

        console.log("✅ [v1/guests/reply] Reply saved");

        return apiSuccess(
            { message: "Reply saved", conversationId },
            { operation: "reply_create" },
            201
        );
    } catch (error) {
        console.error("❌ [v1/guests/reply] Error:", error);
        return apiError("INTERNAL_ERROR", "Failed to save reply", 500);
    }
}

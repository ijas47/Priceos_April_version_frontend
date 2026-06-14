import { connectDB, HostawayConversation } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api/response";
import { guestReplySchema, formatZodErrors } from "@/lib/validators";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/api/rate-limit";
import { requireScopedSession, handleToolError } from "@/lib/agent-tools/utils";

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

    let orgId: string;
    try {
        ({ orgId } = await requireScopedSession(request, "v1/guests/reply"));
    } catch (err) {
        return handleToolError(err, "v1/guests/reply");
    }

    try {
        await connectDB();

        // Tenant isolation: only append to a conversation owned by the caller's org.
        const updated = await HostawayConversation.findOneAndUpdate(
            { hostawayConversationId: conversationId, orgId },
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

        if (!updated) {
            return apiError("NOT_FOUND", "Conversation not found", 404);
        }

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

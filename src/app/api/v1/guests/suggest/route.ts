import { apiSuccess, apiError } from "@/lib/api/response";
import { suggestReplySchema, formatZodErrors } from "@/lib/validators";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/api/rate-limit";

/**
 * POST /api/v1/guests/suggest
 * 
 * Uses the Lyzr Chat Response Agent to generate an AI-drafted reply
 * for a guest message. Falls back to a template if Lyzr is unavailable.
 * 
 * Rate Limit: AI tier (20 req/min) — this endpoint calls external AI.
 * 
 * Request Body:
 *   { message: string, guestName?: string, propertyName?: string }
 * 
 * Response:
 *   { status: "success", data: { reply: "...", source: "lyzr" | "fallback" } }
 */
export async function POST(request: Request) {
    // ── Rate Limiting (AI tier) ──
    const ip = getClientIp(request);
    const rateCheck = checkRateLimit(`guests-suggest:${ip}`, RATE_LIMITS.ai);
    if (!rateCheck.allowed) {
        return apiError("RATE_LIMITED", `AI endpoint rate limited. Try again in ${Math.ceil(rateCheck.resetMs / 1000)}s.`, 429);
    }

    // ── Step 1: Parse & validate ──
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return apiError("PARSE_ERROR", "Request body must be valid JSON", 400);
    }

    const validation = suggestReplySchema.safeParse(body);

    if (!validation.success) {
        return apiError(
            "VALIDATION_ERROR",
            "Invalid request body",
            400,
            formatZodErrors(validation.error)
        );
    }

    const { message, guestName, propertyName } = validation.data;

    try {
        // ── Step 2: Check Lyzr configuration ──
        const lyzrAgentId = process.env.LYZR_Chat_Response_Agent_ID;
        const lyzrApiKey = process.env.LYZR_API_KEY;
        const lyzrApiUrl = process.env.LYZR_API_URL || "https://agent-prod.studio.lyzr.ai/v3/inference/chat/";

        if (!lyzrAgentId || !lyzrApiKey) {
            console.warn("⚠️  [v1/guests/suggest] Lyzr not configured, returning fallback");
            return apiSuccess({
                reply: `Hi ${guestName}, thanks for reaching out! I'll look into this and get back to you shortly.`,
                source: "fallback",
            });
        }

        // ── Step 3: Build prompt and call Lyzr agent ──
        const prompt = `Property: "${propertyName}"
Guest name: ${guestName}
Guest's message: "${message}"

Generate a professional, warm, and concise reply as the property manager. Address their question directly. Keep it to 2-4 sentences. Do not use formal sign-offs.`;

        console.log(`📨 [v1/guests/suggest] Calling Lyzr agent ${lyzrAgentId}...`);

        const agentRes = await fetch(lyzrApiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": lyzrApiKey,
            },
            body: JSON.stringify({
                user_id: "priceos-system",
                agent_id: lyzrAgentId,
                session_id: `reply-${Date.now()}`,
                message: prompt,
            }),
        });

        const agentJson = await agentRes.json();

        if (agentRes.ok && agentJson.response) {
            const rawResponse = typeof agentJson.response === 'string'
                ? agentJson.response
                : agentJson.response?.message || agentJson.response?.data || "";

            // ── Step 4: Extract reply from potentially structured JSON response ──
            let reply = rawResponse;
            try {
                const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    if (parsed.reply) {
                        reply = parsed.reply;
                    }
                }
            } catch {
                // Not JSON — use as-is (plain text reply is fine)
            }

            // Strip any remaining markdown code fences
            reply = reply.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

            console.log(`✅ [v1/guests/suggest] AI draft generated`);
            return apiSuccess({ reply, source: "lyzr" });
        }

        // ── Fallback if Lyzr returned non-OK ──
        console.warn("⚠️  [v1/guests/suggest] Lyzr returned non-OK, using fallback");
        return apiSuccess({
            reply: `Hi ${guestName}, thanks for reaching out! I'll look into this and get back to you shortly.`,
            source: "fallback",
        });
    } catch (error) {
        console.error("❌ [v1/guests/suggest] Error:", error);
        return apiError(
            "AI_SERVICE_ERROR",
            "Failed to generate AI suggestion",
            502
        );
    }
}

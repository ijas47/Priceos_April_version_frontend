import { NextResponse } from "next/server";

/**
 * POST /api/hostaway/suggest-reply
 * 
 * Calls the Lyzr Chat Response Agent to generate a reply suggestion.
 * Uses LYZR_Chat_Response_Agent_ID from .env
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { message, guestName, propertyName } = body;

        if (!message) {
            return NextResponse.json({ error: "message required" }, { status: 400 });
        }

        const lyzrAgentId = process.env.LYZR_Chat_Response_Agent_ID;
        const lyzrApiKey = process.env.LYZR_API_KEY;
        const lyzrApiUrl = process.env.LYZR_API_URL || "https://agent-prod.studio.lyzr.ai/v3/inference/chat/";

        if (!lyzrAgentId || !lyzrApiKey) {
            console.warn("⚠️  [Reply] Lyzr not configured, returning fallback");
            return NextResponse.json({
                success: true,
                reply: `Hi ${guestName || "there"}, thanks for reaching out! I'll look into this and get back to you shortly.`,
                source: "fallback",
            });
        }

        const prompt = `Property: "${propertyName || "Our Property"}"
Guest name: ${guestName || "Guest"}
Guest's message: "${message}"

Generate a professional, warm, and concise reply as the property manager. Address their question directly. Keep it to 2-4 sentences. Do not use formal sign-offs.`;

        console.log(`📨 [Reply] Calling Lyzr agent ${lyzrAgentId}...`);

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

            // The Lyzr agent returns structured JSON like {"reply":"...","sentiment":"...","category":"..."}
            // We need to extract just the "reply" text for the admin's text area
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

            console.log(`✅ [Reply] Lyzr agent returned reply`);
            return NextResponse.json({ success: true, reply, source: "lyzr" });
        }

        // Fallback
        return NextResponse.json({
            success: true,
            reply: `Hi ${guestName || "there"}, thanks for reaching out! I'll look into this and get back to you shortly.`,
            source: "fallback",
        });
    } catch (error) {
        console.error("❌ [Reply] Error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to generate reply" },
            { status: 500 }
        );
    }
}

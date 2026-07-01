import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";
import { connectDB } from "@/lib/db";
import { assertListingOwned, ListingAccessError } from "@/lib/db/assert-listing-owned";

interface HistoryMsg {
    sender?: "guest" | "admin";
    text?: string;
    time?: string;
}

/**
 * POST /api/hostaway/suggest-reply
 *
 * Generates an AI reply DRAFT for a guest conversation via the Lyzr
 * Chat Response Agent. Returns synchronously - the draft is staged in the
 * UI for human review and is NEVER auto-sent to the guest.
 *
 * Body: { messages?: HistoryMsg[], message?: string, guestName, propertyName,
 *         additionalContext? }
 */
export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const {
            messages,
            message,
            guestName,
            propertyName,
            listingId,
            additionalContext,
        }: {
            messages?: HistoryMsg[];
            message?: string;
            guestName?: string;
            propertyName?: string;
            listingId?: string;
            additionalContext?: string;
        } = body;

        // Build conversation history; fall back to a single message
        const history: HistoryMsg[] = Array.isArray(messages) && messages.length > 0
            ? messages
            : message
                ? [{ sender: "guest", text: message }]
                : [];

        if (history.length === 0) {
            return NextResponse.json({ error: "messages or message required" }, { status: 400 });
        }

        const latestGuest = [...history].reverse().find((m) => m.sender === "guest")?.text
            || history[history.length - 1]?.text
            || "";

        const lyzrAgentId = process.env.LYZR_Chat_Response_Agent_ID;
        const lyzrApiKey = process.env.LYZR_API_KEY;
        const lyzrApiUrl = process.env.LYZR_API_URL || "https://agent-prod.studio.lyzr.ai/v3/inference/chat/";

        const fallbackReply = `Hi ${guestName?.split(" ")[0] || "there"}, thanks for reaching out! Let me look into this and get right back to you.`;

        if (!lyzrAgentId || !lyzrApiKey) {
            return NextResponse.json({ success: true, reply: fallbackReply, source: "fallback" });
        }

        let propertyContextBlock = "";
        if (listingId && session.orgId) {
            try {
                await connectDB();
                const listing = await assertListingOwned(session.orgId, listingId);
                propertyContextBlock = `
Property context:
- Name: ${listing.name}
- Area: ${listing.area || listing.city || "Dubai"}
- Bedrooms: ${listing.bedroomsNumber ?? "N/A"}
- Capacity: ${listing.personCapacity ?? "N/A"} guests
- Currency: ${listing.currencyCode || "AED"}
- Standard check-in: 15:00 / check-out: 11:00 (unless guest message states otherwise)
Use this context for amenities, timing, and location answers. Do not quote internal IDs.`;
            } catch (err) {
                if (!(err instanceof ListingAccessError)) {
                    console.warn("[suggest-reply] listing context skipped:", err);
                }
            }
        }

        const transcript = history
            .map((m) => `${m.sender === "admin" ? "Host" : "Guest"}: ${m.text ?? ""}`)
            .join("\n");

        const prompt = `Property: "${propertyName || "Our Property"}"
Guest name: ${guestName || "Guest"}
${propertyContextBlock}

Conversation so far:
${transcript}

Latest guest message: "${latestGuest}"
${additionalContext ? `\nAdditional context from the host (incorporate this): "${additionalContext}"` : ""}

Generate a professional, warm, concise reply as the property manager (2-4 sentences). Address their question directly. No formal sign-offs.`;

        let agentRes: Response;
        try {
            agentRes = await fetch(lyzrApiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-api-key": lyzrApiKey },
                body: JSON.stringify({
                    user_id: "priceos-system",
                    agent_id: lyzrAgentId,
                    session_id: `reply-${Date.now()}`,
                    message: prompt,
                }),
                signal: AbortSignal.timeout(45000),
            });
        } catch (err) {
            console.error("[suggest-reply] Lyzr call failed:", (err as Error).message);
            return NextResponse.json({ success: true, reply: fallbackReply, source: "fallback" });
        }

        const agentJson = await agentRes.json().catch(() => ({} as Record<string, unknown>));

        if (agentRes.ok && agentJson.response) {
            const rawResponse = typeof agentJson.response === "string"
                ? agentJson.response
                : (agentJson.response as Record<string, string>)?.message
                || (agentJson.response as Record<string, string>)?.data
                || "";

            let reply = rawResponse;
            let sentiment: string | undefined;
            try {
                const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    if (parsed.reply) reply = parsed.reply;
                    if (parsed.sentiment) sentiment = parsed.sentiment;
                }
            } catch {
                // Plain text reply - use as-is
            }

            reply = reply.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
            return NextResponse.json({ success: true, reply, sentiment, source: "lyzr" });
        }

        return NextResponse.json({ success: true, reply: fallbackReply, source: "fallback" });
    } catch (error) {
        console.error("[suggest-reply]", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to generate reply" },
            { status: 500 }
        );
    }
}

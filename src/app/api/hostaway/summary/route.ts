import { NextResponse } from "next/server";
import { connectDB, GuestSummary, HostawayConversation, Listing } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import mongoose from "mongoose";

/**
 * GET /api/hostaway/summary?listingId=X&from=YYYY-MM-DD&to=YYYY-MM-DD
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const listingId = searchParams.get("listingId");
    const dateFrom = searchParams.get("from");
    const dateTo = searchParams.get("to");

    if (!listingId || !dateFrom || !dateTo) {
        return NextResponse.json({ error: "listingId, from, to required" }, { status: 400 });
    }

    console.log(`📋 [Summary] Checking cache for listing ${listingId}, ${dateFrom} → ${dateTo}`);

    try {
        await connectDB();

        const listingObjectId = new mongoose.Types.ObjectId(listingId);
        const cached = await GuestSummary.findOne({
            listingId: listingObjectId,
            dateFrom,
            dateTo,
        }).lean();

        if (cached) {
            console.log(`✅ [Summary] Cache HIT`);
            return NextResponse.json({ success: true, summary: cached, cached: true });
        }

        console.log(`📭 [Summary] Cache MISS`);
        return NextResponse.json({ success: true, summary: null, cached: false });
    } catch (error) {
        console.error("❌ [Summary] Error:", error);
        return NextResponse.json({ error: "Failed to check summary" }, { status: 500 });
    }
}

/**
 * POST /api/hostaway/summary
 * Generates AI summary from stored conversations, saves to guest_summaries.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { listingId, dateFrom, dateTo } = body;

        if (!listingId || !dateFrom || !dateTo) {
            return NextResponse.json({ error: "listingId, dateFrom, dateTo required" }, { status: 400 });
        }

        await connectDB();
        const session = await getSession();
        const orgId = session?.orgId
            ? new mongoose.Types.ObjectId(session.orgId)
            : new mongoose.Types.ObjectId();

        const listingObjectId = new mongoose.Types.ObjectId(listingId);

        console.log(`🤖 [Summary] Generating summary for listing ${listingId}, ${dateFrom} → ${dateTo}`);

        // Load cached conversations
        const conversations = await HostawayConversation.find({
            listingId: listingObjectId,
            dateFrom: { $lte: dateTo },
            dateTo: { $gte: dateFrom },
        }).lean();

        // Deduplicate
        const uniqueMap = new Map<string, typeof conversations[0]>();
        for (const conv of conversations) {
            if (!uniqueMap.has(conv.hostawayConversationId)) {
                uniqueMap.set(conv.hostawayConversationId, conv);
            }
        }
        const uniqueConversations = Array.from(uniqueMap.values());

        if (uniqueConversations.length === 0) {
            return NextResponse.json(
                { error: "No conversations found. Please sync conversations first." },
                { status: 404 }
            );
        }

        // Get property name
        const listing = await Listing.findById(listingObjectId).select("name").lean();

        const CHUNK_SIZE = 15;
        const chunks: typeof uniqueConversations[] = [];
        for (let i = 0; i < uniqueConversations.length; i += CHUNK_SIZE) {
            chunks.push(uniqueConversations.slice(i, i + CHUNK_SIZE));
        }

        let summaryData: any;

        try {
            const lyzrAgentId = process.env.LYZR_Conversation_Summary_Agent_ID;
            const lyzrApiKey = process.env.LYZR_API_KEY;
            const lyzrApiUrl = process.env.LYZR_API_URL || "https://agent-prod.studio.lyzr.ai/v3/inference/chat/";

            if (!lyzrAgentId || !lyzrApiKey) throw new Error("Lyzr not configured");

            const callLyzr = async (prompt: string, sessionSuffix: string): Promise<string | null> => {
                const res = await fetch(lyzrApiUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "x-api-key": lyzrApiKey },
                    body: JSON.stringify({
                        user_id: "priceos-system",
                        agent_id: lyzrAgentId,
                        session_id: `summary-${listingId}-${sessionSuffix}`,
                        message: prompt,
                    }),
                });
                const json = await res.json();
                if (res.ok && json.response) {
                    return typeof json.response === "string"
                        ? json.response
                        : json.response?.message || json.response?.data || JSON.stringify(json.response);
                }
                return null;
            };

            if (chunks.length === 1) {
                const conversationText = uniqueConversations
                    .map((conv) => {
                        const recentMsgs = conv.messages.slice(-10);
                        const msgText = recentMsgs.map((m) => `  ${m.sender}: "${m.text}"`).join("\n");
                        return `--- Conversation with ${conv.guestName} ---\n${msgText}`;
                    })
                    .join("\n\n");

                const prompt = `You are a hospitality operations analyst. Analyze guest conversations for "${listing?.name || "Property"}" (${dateFrom} to ${dateTo}).

CONVERSATIONS:
${conversationText}

Respond in this exact JSON format:
{
  "sentiment": "Positive" | "Neutral" | "Needs Attention",
  "themes": ["theme1", "theme2"],
  "actionItems": ["action1", "action2"],
  "bulletPoints": ["summary1", "summary2"],
  "totalConversations": number,
  "needsReplyCount": number
}`;

                const responseText = await callLyzr(prompt, `${dateFrom}-${dateTo}`);
                if (responseText) {
                    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                    if (jsonMatch) summaryData = JSON.parse(jsonMatch[0]);
                }
            } else {
                const chunkSummaries: string[] = [];
                for (let idx = 0; idx < chunks.length; idx++) {
                    const chunk = chunks[idx];
                    const conversationText = chunk
                        .map((conv) => {
                            const recentMsgs = conv.messages.slice(-5);
                            const msgText = recentMsgs.map((m) => `  ${m.sender}: "${m.text}"`).join("\n");
                            return `--- ${conv.guestName} ---\n${msgText}`;
                        })
                        .join("\n\n");

                    const result = await callLyzr(
                        `Summarize ${chunk.length} conversations: ${conversationText}`,
                        `chunk-${idx}-${dateFrom}`
                    );
                    chunkSummaries.push(result || `Batch ${idx + 1}: ${chunk.length} conversations`);
                }

                const reduceResult = await callLyzr(
                    `Merge into one JSON: {"sentiment":"...","themes":[],"actionItems":[],"bulletPoints":[],"totalConversations":${uniqueConversations.length},"needsReplyCount":0}\n\nBatches:\n${chunkSummaries.join("\n\n")}`,
                    `reduce-${dateFrom}-${dateTo}`
                );
                if (reduceResult) {
                    const jsonMatch = reduceResult.match(/\{[\s\S]*\}/);
                    if (jsonMatch) summaryData = JSON.parse(jsonMatch[0]);
                }
            }
        } catch {
            console.warn("⚠️  [Summary] Lyzr call failed, using fallback...");
        }

        // Local fallback
        if (!summaryData) {
            const needsReply = uniqueConversations.filter((c) => {
                const last = c.messages[c.messages.length - 1];
                return last && last.sender === "guest";
            }).length;

            summaryData = {
                sentiment: needsReply > uniqueConversations.length / 2 ? "Needs Attention" : "Positive",
                themes: ["General Inquiry", "Check-in", "Amenities"],
                actionItems: needsReply > 0 ? [`Reply to ${needsReply} pending message(s)`] : [],
                bulletPoints: uniqueConversations.map((c) => {
                    const last = c.messages[c.messages.length - 1];
                    return `${c.guestName}: "${last?.text || "No messages"}" — ${last?.sender === "guest" ? "NEEDS REPLY" : "Resolved"}`;
                }),
                totalConversations: uniqueConversations.length,
                needsReplyCount: needsReply,
            };
        }

        // Upsert summary
        await GuestSummary.deleteOne({ listingId: listingObjectId, dateFrom, dateTo });
        await GuestSummary.create({
            orgId,
            listingId: listingObjectId,
            dateFrom,
            dateTo,
            sentiment: summaryData.sentiment,
            themes: summaryData.themes,
            actionItems: summaryData.actionItems,
            bulletPoints: summaryData.bulletPoints,
            totalConversations: summaryData.totalConversations,
            needsReplyCount: summaryData.needsReplyCount,
        });

        console.log(`✅ [Summary] Summary generated and saved`);
        return NextResponse.json({ success: true, summary: summaryData, cached: false });
    } catch (error) {
        console.error("❌ [Summary] Error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to generate summary" },
            { status: 500 }
        );
    }
}

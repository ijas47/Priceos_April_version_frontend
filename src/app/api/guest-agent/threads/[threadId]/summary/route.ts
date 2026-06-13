import { NextRequest, NextResponse } from "next/server";
import { connectDB, HostawayConversation } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import mongoose from "mongoose";

/**
 * POST /api/guest-agent/threads/[threadId]/summary
 *
 * Summarizes a single guest conversation. threadId is the inbox id
 * "{propertyId}-{hostawayConversationId}". Returns the shape the inbox renders:
 * { sentiment, sentimentScore, confidence, themes, actionItems, bulletPoints,
 *   totalConversations, needsReplyCount }
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { threadId } = await params;
    // threadId = "{propertyId}-{hostawayConversationId}" — split on first dash.
    const dashIdx = threadId.indexOf("-");
    const hostawayConversationId = dashIdx >= 0 ? threadId.slice(dashIdx + 1) : threadId;

    await connectDB();
    const orgId = new mongoose.Types.ObjectId(session.orgId);

    const conv = await HostawayConversation.findOne({
      orgId,
      hostawayConversationId,
    }).lean();

    if (!conv) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const messages = conv.messages || [];
    const lastMsg = messages[messages.length - 1];
    const needsReply = lastMsg?.sender === "guest";

    const transcript = messages
      .map((m) => `${m.sender === "admin" ? "Host" : "Guest"}: ${m.text}`)
      .join("\n");

    let summary: any = null;

    // Try Lyzr for a richer summary; fall back to heuristics on any failure.
    const lyzrAgentId = process.env.LYZR_Conversation_Summary_Agent_ID;
    const lyzrApiKey = process.env.LYZR_API_KEY;
    const lyzrApiUrl = process.env.LYZR_API_URL || "https://agent-prod.studio.lyzr.ai/v3/inference/chat/";

    if (lyzrAgentId && lyzrApiKey && transcript) {
      try {
        const prompt = `Summarize this guest conversation with ${conv.guestName}.
Conversation:
${transcript}

Respond in this exact JSON:
{
  "sentiment": "Positive" | "Neutral" | "Needs Attention",
  "themes": ["..."],
  "actionItems": ["..."],
  "bulletPoints": ["..."]
}`;
        const res = await fetch(lyzrApiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": lyzrApiKey },
          body: JSON.stringify({
            user_id: "priceos-system",
            agent_id: lyzrAgentId,
            session_id: `thread-summary-${hostawayConversationId}`,
            message: prompt,
          }),
          signal: AbortSignal.timeout(45000),
        });
        const json = await res.json().catch(() => ({}));
        const raw = typeof json.response === "string"
          ? json.response
          : json.response?.message || json.response?.data || "";
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) summary = JSON.parse(match[0]);
      } catch (err) {
        console.warn("[thread-summary] Lyzr failed:", (err as Error).message);
      }
    }

    if (!summary) {
      summary = {
        sentiment: needsReply ? "Needs Attention" : "Positive",
        themes: ["Guest inquiry"],
        actionItems: needsReply ? ["Reply to the guest's latest message"] : [],
        bulletPoints: messages.slice(-4).map((m) => `${m.sender === "admin" ? "Host" : conv.guestName}: ${m.text.slice(0, 120)}`),
      };
    }

    const sentimentScore =
      summary.sentiment === "Positive" ? 85 :
      summary.sentiment === "Needs Attention" ? 28 : 55;
    const confidence = Math.min(95, 45 + messages.length * 6);

    return NextResponse.json({
      sentiment: summary.sentiment,
      sentimentScore,
      confidence,
      themes: summary.themes || [],
      actionItems: summary.actionItems || [],
      bulletPoints: summary.bulletPoints || [],
      totalConversations: 1,
      needsReplyCount: needsReply ? 1 : 0,
    });
  } catch (error: any) {
    console.error("[thread-summary]", error);
    return NextResponse.json({ error: "Failed to generate summary" }, { status: 500 });
  }
}

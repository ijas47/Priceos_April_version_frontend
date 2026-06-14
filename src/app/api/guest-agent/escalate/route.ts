import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB, HostawayConversation } from "@/lib/db";
import { requireScopedSession, handleToolError } from "@/lib/agent-tools/utils";
import { notifyTeam, isNotifyConfigured, type NotifyUrgency } from "@/lib/notify";

/**
 * POST /api/guest-agent/escalate
 *
 * Human handover. Flags a guest conversation for human takeover: pauses the
 * thread for auto-reply, records the reason, and pushes an alert to whatever
 * team channels are configured (Slack / WhatsApp / SMS). Callable by the guest
 * agent (Bearer API key) or a human from the inbox UI (session cookie).
 *
 * Body: { conversationId | threadId, reason, urgency?, contextSummary? }
 */
export async function POST(req: NextRequest) {
    try {
        const { orgId } = await requireScopedSession(req, "guest-agent/escalate");
        await connectDB();

        const body = await req.json().catch(() => ({}));
        const conversationId = String(body.conversationId || body.threadId || "").trim();
        const reason = String(body.reason || "").trim();
        const urgency = (["low", "medium", "high", "critical"].includes(body.urgency)
            ? body.urgency
            : "high") as NotifyUrgency;
        const contextSummary = String(body.contextSummary || "").trim();

        if (!conversationId) {
            return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
        }

        const orgOid = new mongoose.Types.ObjectId(orgId);

        // Resolve by Hostaway conversation id or by Mongo _id, scoped to org.
        const query: Record<string, unknown> = { orgId: orgOid };
        if (/^[a-fA-F0-9]{24}$/.test(conversationId)) {
            query.$or = [{ hostawayConversationId: conversationId }, { _id: new mongoose.Types.ObjectId(conversationId) }];
        } else {
            query.hostawayConversationId = conversationId;
        }

        const conv = await HostawayConversation.findOneAndUpdate(
            query,
            {
                $set: {
                    escalated: true,
                    escalationReason: reason || "Flagged for human review",
                    escalationUrgency: urgency,
                    escalatedAt: new Date(),
                    needsReply: true,
                },
            },
            { new: true },
        ).populate<{ listingId: { name?: string } }>("listingId", "name");

        if (!conv) {
            return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
        }

        const propertyName = (conv.listingId as unknown as { name?: string })?.name || "a property";
        const origin = new URL(req.url).origin;
        const link = `${origin}/inbox?thread=${conv.hostawayConversationId}`;

        const lastGuestMsg = [...(conv.messages || [])]
            .reverse()
            .find((m) => m.sender !== "admin")?.text;

        const notifyResult = await notifyTeam({
            title: `Guest thread needs a human — ${conv.guestName}`,
            urgency,
            body: [
                `*Property:* ${propertyName}`,
                `*Guest:* ${conv.guestName}`,
                `*Reason:* ${reason || "Flagged for human review"}`,
                contextSummary ? `*Context:* ${contextSummary}` : "",
                lastGuestMsg ? `*Last message:* "${lastGuestMsg.slice(0, 240)}"` : "",
            ]
                .filter(Boolean)
                .join("\n"),
            link,
        });

        return NextResponse.json({
            success: true,
            escalated: true,
            conversationId: conv.hostawayConversationId,
            urgency,
            notify: {
                configured: isNotifyConfigured(),
                delivered: notifyResult.delivered,
                failed: notifyResult.failed,
                skipped: notifyResult.skipped,
            },
            message: notifyResult.skipped
                ? "Thread escalated. No alert channel configured — set SLACK_WEBHOOK_URL or Twilio vars to notify the team."
                : `Thread escalated and team alerted via ${notifyResult.delivered.join(", ") || "no channel (all failed)"}.`,
        });
    } catch (error: unknown) {
        return handleToolError(error, "guest-agent/escalate");
    }
}

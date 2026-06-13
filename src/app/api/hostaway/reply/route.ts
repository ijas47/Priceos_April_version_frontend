import { NextResponse } from "next/server";
import { connectDB, HostawayConversation, Organization } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { createHostawayClient, isGuestSendEnabled } from "@/lib/hostaway/client";
import { getHostawayApiKey } from "@/lib/env";
import mongoose from "mongoose";

/**
 * POST /api/hostaway/reply
 *
 * Stages a host reply on a guest conversation. The reply is ALWAYS saved to
 * MongoDB. It is delivered to the guest via Hostaway ONLY when
 * HOSTAWAY_ALLOW_GUEST_SEND=true — otherwise it stays local-only.
 *
 * Body: { conversationId, text }
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const conversationId = String(body.conversationId || "");
    const text = String(body.text || "").trim();

    if (!conversationId || !text) {
      return NextResponse.json({ error: "conversationId and text are required" }, { status: 400 });
    }

    await connectDB();
    const orgId = new mongoose.Types.ObjectId(session.orgId);

    // Persist the reply locally — scoped to this org's conversation.
    const conv = await HostawayConversation.findOneAndUpdate(
      { orgId, hostawayConversationId: conversationId },
      {
        $push: {
          messages: {
            sender: "admin",
            text,
            timestamp: new Date().toISOString(),
          },
        },
        $set: { needsReply: false },
      },
      { new: true }
    );

    if (!conv) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    // Optional delivery to the guest via Hostaway (gated, off by default).
    let delivered = false;
    let deliveryError: string | undefined;
    if (isGuestSendEnabled()) {
      try {
        const org = await Organization.findById(orgId).select("hostawayApiKey").lean();
        const apiKey = org?.hostawayApiKey || getHostawayApiKey();
        if (!apiKey) throw new Error("No Hostaway API key configured for this org");
        const client = createHostawayClient(apiKey);
        await client.sendMessage(conversationId, text);
        delivered = true;
      } catch (err) {
        deliveryError = (err as Error).message;
        console.error("[hostaway/reply] delivery failed:", deliveryError);
      }
    }

    return NextResponse.json({
      success: true,
      delivered,
      deliveryError,
      message: delivered ? "Reply sent to guest" : "Reply saved (local only — not delivered to guest)",
    });
  } catch (error: any) {
    console.error("[hostaway/reply]", error);
    return NextResponse.json({ error: error.message || "Failed to save reply" }, { status: 500 });
  }
}

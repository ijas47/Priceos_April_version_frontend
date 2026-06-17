import { NextRequest, NextResponse } from "next/server";
import { connectDB, HostawayConversation, Listing } from "@/lib/db";
import { format } from "date-fns";

/**
 * POST /api/webhooks/hostaway
 *
 * Receives Hostaway unified webhooks (new guest messages, etc.) and upserts
 * them into MongoDB so the inbox updates in near-real-time instead of only
 * on sync. RECEIVE-ONLY - this never writes back to Hostaway.
 *
 * Security: fail-closed. Requires HOSTAWAY_WEBHOOK_SECRET to be configured and
 * matched via ?secret= query param or x-webhook-secret header. Without it the
 * endpoint refuses traffic so it can't be used to inject fake guest messages.
 *
 * Register in Hostaway: Settings → API & Webhooks → Unified Webhook URL =
 *   https://<your-domain>/api/webhooks/hostaway?secret=<HOSTAWAY_WEBHOOK_SECRET>
 */
export async function POST(req: NextRequest) {
  const secret = process.env.HOSTAWAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhooks/hostaway] HOSTAWAY_WEBHOOK_SECRET not configured - refusing");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const provided = req.nextUrl.searchParams.get("secret") || req.headers.get("x-webhook-secret");
  if (provided !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const payload = await req.json().catch(() => ({} as Record<string, any>));
    const event: string = payload.event || payload.object || "";
    const data: Record<string, any> = payload.data || payload;

    // We only care about conversation messages. Ack everything else quickly.
    const isMessage =
      /message/i.test(event) ||
      data.conversationId !== undefined ||
      data.conversationMessageId !== undefined;

    if (!isMessage) {
      return NextResponse.json({ ok: true, ignored: event || "unknown" });
    }

    const conversationId = String(data.conversationId ?? data.conversationMessageId ?? data.id ?? "");
    const listingMapId = data.listingMapId ?? data.listingId;
    const messageBody = String(data.body ?? data.message ?? "").trim();
    const isIncoming = data.isIncoming === 1 || data.isIncoming === "1" || data.isIncoming === true;

    if (!conversationId || !messageBody) {
      return NextResponse.json({ ok: true, ignored: "incomplete" });
    }

    await connectDB();

    // Map the Hostaway listing to our org/listing.
    const listing = listingMapId
      ? await Listing.findOne({ hostawayId: String(listingMapId) }).select("_id orgId").lean()
      : null;

    if (!listing) {
      console.warn(`[webhooks/hostaway] no listing for listingMapId=${listingMapId} - skipping`);
      return NextResponse.json({ ok: true, ignored: "unmapped-listing" });
    }

    const todayStr = format(new Date(), "yyyy-MM-dd");
    const guestName = data.guestName || data.recipientName || "Guest";

    await HostawayConversation.findOneAndUpdate(
      { orgId: listing.orgId, hostawayConversationId: conversationId },
      {
        $push: {
          messages: {
            sender: isIncoming ? "guest" : "admin",
            text: messageBody,
            timestamp: data.date ? new Date(data.date).toISOString() : new Date().toISOString(),
          },
        },
        $set: { needsReply: isIncoming, syncedAt: new Date() },
        $setOnInsert: {
          orgId: listing.orgId,
          listingId: listing._id,
          hostawayConversationId: conversationId,
          guestName,
          dateFrom: todayStr,
          dateTo: todayStr,
        },
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({ ok: true, conversationId });
  } catch (error: any) {
    console.error("[webhooks/hostaway]", error);
    // Return 200 so Hostaway doesn't hammer retries on a parsing edge case.
    return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
  }
}

import { NextResponse } from "next/server";
import { connectDB, HostawayConversation } from "@/lib/db";
import { getSession } from "@/lib/auth/server";

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const conversationId = String(body.conversationId || "");
    const text = String(body.text || "");

    if (!conversationId || !text) {
      return NextResponse.json({ error: "conversationId and text are required" }, { status: 400 });
    }

    await connectDB();
    await HostawayConversation.findOneAndUpdate(
      { hostawayId: Number(conversationId) },
      {
        $push: {
          messages: {
            hostawayMessageId: null,
            authorType: "host",
            authorName: session.email,
            body: text,
            sentAt: new Date().toISOString(),
          },
        },
      }
    );

    return NextResponse.json({ success: true, message: "Reply saved" });
  } catch (error: any) {
    console.error("[hostaway/reply] Error:", error);
    return NextResponse.json({ error: error.message || "Failed to save reply" }, { status: 500 });
  }
}

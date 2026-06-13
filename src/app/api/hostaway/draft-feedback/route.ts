import { NextRequest, NextResponse } from "next/server";
import { connectDB, DraftFeedback } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import mongoose from "mongoose";

/**
 * POST /api/hostaway/draft-feedback
 *
 * Records thumbs up/down on an AI draft for later agent tuning.
 * Best-effort — the inbox doesn't block on this.
 *
 * Body: { conversationId, feedback: "good" | "bad", draft }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { conversationId, feedback, draft } = body;

    if (!conversationId || (feedback !== "good" && feedback !== "bad")) {
      return NextResponse.json({ error: "conversationId and valid feedback required" }, { status: 400 });
    }

    await connectDB();
    await DraftFeedback.create({
      orgId: new mongoose.Types.ObjectId(session.orgId),
      conversationId: String(conversationId),
      feedback,
      draft: String(draft || ""),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[draft-feedback]", error);
    return NextResponse.json({ error: "Failed to record feedback" }, { status: 500 });
  }
}

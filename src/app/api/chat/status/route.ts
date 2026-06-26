import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/chat/status - Lyzr agent-event WebSocket credentials.
 * Never exposes LYZR_API_KEY (server inference secret).
 * Use LYZR_WS_STREAM_KEY or NEXT_PUBLIC_LYZR_API_KEY for browser WebSocket only.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const wsApiKey =
    process.env.LYZR_WS_STREAM_KEY?.trim() ||
    process.env.NEXT_PUBLIC_LYZR_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_LYZR_API_KEY2?.trim() ||
    null;

  return NextResponse.json({
    wsApiKey,
    wsBaseUrl: process.env.LYZR_STREAM_URL ?? process.env.NEXT_PUBLIC_LYZR_WS_BASE_URL ?? null,
    serverInferenceKeyConfigured: Boolean(process.env.LYZR_API_KEY),
  });
}
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/chat/status — Lyzr agent-event WebSocket credentials.
 * Consumed by use-lyzr-agent-events; returns nulls when not configured
 * (the hook falls back to its built-in defaults).
 */
export async function GET() {
  return NextResponse.json({
    wsApiKey: process.env.LYZR_API_KEY ?? null,
    wsBaseUrl: process.env.LYZR_STREAM_URL ?? null,
  });
}

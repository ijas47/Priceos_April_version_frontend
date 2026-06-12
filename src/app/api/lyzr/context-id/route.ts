import { NextResponse } from "next/server";

/** GET /api/lyzr/context-id — no Lyzr RAG context configured in self-hosted mode. */
export async function GET() {
  return NextResponse.json({ contextId: process.env.LYZR_CONTEXT_ID ?? null });
}

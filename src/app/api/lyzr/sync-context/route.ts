import { NextResponse } from "next/server";

/** POST /api/lyzr/sync-context - Lyzr context sync is handled out-of-band; no-op. */
export async function POST() {
  return NextResponse.json({ success: true, skipped: true });
}

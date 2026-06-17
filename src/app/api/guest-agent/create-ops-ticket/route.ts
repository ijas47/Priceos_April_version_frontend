import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";

/** POST /api/guest-agent/create-ops-ticket - acknowledge (stub until ticket model lands). */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  return NextResponse.json({ success: true, ticket: { id: `tmp-${Date.now()}`, ...body } });
}

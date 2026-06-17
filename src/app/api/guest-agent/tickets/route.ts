import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/** GET /api/guest-agent/tickets - ops tickets (stub until ticket model lands). */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ tickets: [] });
}

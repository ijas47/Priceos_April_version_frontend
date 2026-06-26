import { NextResponse } from "next/server";
import type { SessionPayload } from "@/lib/auth/server";

/**
 * Debug/maintenance routes must never ship open in production SaaS.
 * Requires owner role + explicit ALLOW_DEBUG_ROUTES=true (local/staging only).
 */
export function guardDebugRoute(session: SessionPayload | null): NextResponse | null {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEBUG_ROUTES !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.role !== "owner" && session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return null;
}
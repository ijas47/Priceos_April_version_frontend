import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * REMOVED — was a cross-tenant data hijack risk in SaaS.
 * Use POST /api/org/repair-scope (claims orphans for your org only) instead.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "This endpoint has been removed",
      alternative: "POST /api/org/repair-scope",
      reason: "Cross-tenant reassignment is not allowed in multi-tenant SaaS",
    },
    { status: 410 }
  );
}
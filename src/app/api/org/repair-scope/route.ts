import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";
import { repairOrgListingScope } from "@/lib/db/org-scope";

export const dynamic = "force-dynamic";

/** POST /api/org/repair-scope — claim orphan listings for the logged-in org. */
export async function POST() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await repairOrgListingScope(session.orgId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[org/repair-scope]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Repair failed" },
      { status: 500 }
    );
  }
}
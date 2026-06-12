import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";

export async function GET() {
    try {
        const session = await getSession();

        if (!session) {
            return NextResponse.json({ approved: false, reason: "unauthenticated" }, { status: 401 });
        }

        // JWT auth means the user is always approved — no separate approval flow
        return NextResponse.json({ approved: true, email: session.email });
    } catch (err) {
        console.error("[check-approval] error:", err);
        return NextResponse.json({ approved: false, reason: "error" }, { status: 500 });
    }
}

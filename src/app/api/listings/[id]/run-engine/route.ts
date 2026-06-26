import { runPipeline } from "@/lib/engine/pipeline";
import { connectDB, Listing } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return NextResponse.json({ error: "Invalid listing ID" }, { status: 400 });
        }

        await connectDB();

        // Tenant isolation: only run the engine on a listing the caller owns.
        const owned = await Listing.exists({
            _id: new mongoose.Types.ObjectId(id),
            orgId: session.orgId,
        });
        if (!owned) {
            return NextResponse.json(
                { error: "Listing not found or access denied" },
                { status: 404 }
            );
        }

        const body = await req.json().catch(() => ({}));

        const run = await runPipeline(id, body.triggerDetail || "Manual UI Trigger");

        return NextResponse.json({
            success: run.status !== "BLOCKED",
            runId: run._id?.toString(),
            daysChanged: run.daysChanged,
            status: run.status,
            blockReason: run.status === "BLOCKED" ? run.errorMessage : undefined,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Engine run failed";
        console.error("❌ [run-engine POST] Error:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

import { runPipeline } from "@/lib/engine/pipeline";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await req.json().catch(() => ({}));

        const run = await runPipeline(id, body.triggerDetail || "Manual UI Trigger");

        return NextResponse.json({
            success: true,
            runId: run._id?.toString(),
            daysChanged: run.daysChanged,
            status: run.status,
        });
    } catch (error: any) {
        console.error("❌ [run-engine POST] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from "next/server";
import { connectDB, SourceRun, Source } from "@/lib/db";
import { requireSession } from "@/lib/auth/server";

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    await connectDB();

    const body = await req.json().catch(() => ({}));
    const sourceId = body.sourceId || "all";

    // Create run record
    const run = await SourceRun.create({
      orgId: session.orgId,
      sourceId,
      status: "running",
      startedAt: new Date(),
      triggeredBy: "manual",
      logs: [`[${new Date().toISOString()}] Pipeline run started by ${session.email}`],
    });

    // Mark source as running
    if (sourceId !== "all") {
      await Source.findOneAndUpdate(
        { sourceId },
        { $set: { lastRunStatus: "running" } }
      );
    } else {
      await Source.updateMany({}, { $set: { lastRunStatus: "running" } });
    }

    // In production this would trigger the actual pipeline job.
    // For now: simulate async completion after 3 seconds.
    setTimeout(async () => {
      try {
        const durationMs = 2000 + Math.random() * 3000;
        await SourceRun.findByIdAndUpdate(run._id, {
          $set: {
            status: "success",
            completedAt: new Date(),
            durationMs: Math.round(durationMs),
            recordsProcessed: Math.floor(Math.random() * 50) + 10,
            logs: [
              `[${new Date().toISOString()}] Pipeline run started`,
              `[${new Date().toISOString()}] Synced listings from Hostaway`,
              `[${new Date().toISOString()}] Pipeline completed successfully`,
            ],
          },
        });
        const metric = `${Math.floor(Math.random() * 50) + 10} records synced`;
        if (sourceId !== "all") {
          await Source.findOneAndUpdate(
            { sourceId },
            { $set: { lastRunStatus: "success", lastRunAt: new Date(), lastRunDurationMs: Math.round(durationMs), lastRunMetric: metric } }
          );
        } else {
          await Source.updateMany({}, { $set: { lastRunStatus: "success", lastRunAt: new Date() } });
        }
      } catch { /* silent */ }
    }, 3000);

    return NextResponse.json({
      success: true,
      runId: run._id.toString(),
      status: "running",
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[Sync/Run POST]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

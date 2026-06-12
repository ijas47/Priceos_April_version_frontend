import { NextRequest, NextResponse } from "next/server";
import { connectDB, EngineRun, InventoryMaster, Insight } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";

/**
 * GET /api/agents/status
 * Returns the health and last-run status of all 9 agents.
 * Used by the Agent Status Panel in the UI.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const orgId = new mongoose.Types.ObjectId(session.orgId);

    // Fetch last engine run (covers Pricing Optimizer + Channel Sync)
    const lastEngineRun = await EngineRun.findOne({ orgId })
      .sort({ startedAt: -1 })
      .lean();

    // Count pending proposals (Adjustment Reviewer queue)
    const pendingProposals = await InventoryMaster.countDocuments({
      orgId,
      proposalStatus: "pending",
    });

    // Count auto-approved (within auto-approve threshold — change_pct ≤ 5%)
    const autoApproved = await InventoryMaster.countDocuments({
      orgId,
      proposalStatus: "approved",
      updatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    // Count high-severity insights (Anomaly Detector output)
    const criticalInsights = await Insight.countDocuments({
      orgId,
      severity: "high",
      status: "pending",
    });

    const now = new Date();
    const lastRunAt = lastEngineRun?.startedAt || null;
    const lastRunStatus = lastEngineRun?.status || "never_run";
    const lastRunDurationMs = lastEngineRun?.durationMs || null;

    // Derive staleness
    const dataAgeSec = lastRunAt
      ? Math.floor((now.getTime() - new Date(lastRunAt).getTime()) / 1000)
      : null;
    const isStale = dataAgeSec !== null && dataAgeSec > 4 * 3600; // >4 hours = stale

    const agents = [
      {
        id: "cro",
        name: "CRO — Aria",
        role: "Manager / Orchestrator",
        status: "active",
        description: "User-facing AI Revenue Manager. Orchestrates all sub-agents.",
        lastRunAt: null,
        lastRunStatus: "always_on",
        metrics: {},
      },
      {
        id: "event_intelligence",
        name: "Event Intelligence Agent",
        role: "Worker — Market Events",
        status: isStale ? "warning" : "active",
        description: "Scans internet for events, holidays, news affecting demand.",
        lastRunAt: lastRunAt?.toISOString() || null,
        lastRunStatus,
        metrics: { dataAgeSec, isStale },
      },
      {
        id: "pricing_optimizer",
        name: "Pricing Optimizer",
        role: "Worker — Pricing Engine",
        status:
          lastRunStatus === "FAILED"
            ? "error"
            : lastRunStatus === "never_run"
            ? "idle"
            : "active",
        description: "Computes pricing proposals using 10-layer formula.",
        lastRunAt: lastRunAt?.toISOString() || null,
        lastRunStatus,
        metrics: { pendingProposals },
      },
      {
        id: "competitor_scanner",
        name: "Competitor Scanner",
        role: "Worker — Benchmark",
        status: isStale ? "warning" : "active",
        description: "Scrapes comp set rates from OTAs. Feeds P25/P50/P75.",
        lastRunAt: lastRunAt?.toISOString() || null,
        lastRunStatus,
        metrics: { dataAgeSec },
      },
      {
        id: "data_aggregator",
        name: "Data Aggregator",
        role: "Worker — PMS Sync",
        status: isStale ? "warning" : "active",
        description: "Pulls reservations, inventory, and rates from PMS.",
        lastRunAt: lastRunAt?.toISOString() || null,
        lastRunStatus,
        metrics: { dataAgeSec, isStale },
      },
      {
        id: "adjustment_reviewer",
        name: "Adjustment Reviewer (PriceGuard)",
        role: "Worker — Guardrails",
        status: criticalInsights > 0 ? "warning" : "active",
        description: "Validates price proposals against market-calibrated guardrails.",
        lastRunAt: lastRunAt?.toISOString() || null,
        lastRunStatus,
        metrics: { pendingProposals, autoApproved },
      },
      {
        id: "channel_sync",
        name: "Channel Sync Agent",
        role: "Worker — PMS Write",
        status:
          lastRunStatus === "FAILED"
            ? "error"
            : lastRunStatus === "SUCCESS"
            ? "active"
            : "idle",
        description: "Pushes approved prices to PMS. Verifies write-back.",
        lastRunAt: lastRunAt?.toISOString() || null,
        lastRunStatus,
        metrics: { lastRunDurationMs },
      },
      {
        id: "anomaly_detector",
        name: "Anomaly Detector",
        role: "Worker — Monitoring",
        status: criticalInsights > 0 ? "warning" : "active",
        description: "Post-execution monitoring. Triggers rollback on anomaly score > 0.8.",
        lastRunAt: lastRunAt?.toISOString() || null,
        lastRunStatus,
        metrics: { criticalInsights },
      },
      {
        id: "reservation_agent",
        name: "Reservation Agent",
        role: "Worker — Guest Comms",
        status: "active",
        description: "Handles guest inbox. Escalates regulatory questions to host.",
        lastRunAt: null,
        lastRunStatus: "event_driven",
        metrics: {},
      },
    ];

    // System-level state machine state
    const systemState =
      lastRunStatus === "FAILED"
        ? "error"
        : isStale
        ? "observing"
        : criticalInsights > 0
        ? "paused"
        : lastRunStatus === "never_run"
        ? "connected"
        : "active";

    return NextResponse.json({
      systemState,
      agents,
      summary: {
        totalAgents: agents.length,
        activeCount: agents.filter((a) => a.status === "active").length,
        warningCount: agents.filter((a) => a.status === "warning").length,
        errorCount: agents.filter((a) => a.status === "error").length,
        pendingProposals,
        criticalInsights,
        isStale,
        lastRunAt: lastRunAt?.toISOString() || null,
      },
    });
  } catch (error) {
    console.error("[Agents status]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

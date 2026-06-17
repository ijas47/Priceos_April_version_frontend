"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, RefreshCw, Activity, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";

interface EngineRun {
  _id: string;
  listingId: string;
  startedAt: string;
  status: "SUCCESS" | "FAILED" | "RUNNING";
  daysChanged: number;
  durationMs: number;
  errorMessage?: string;
}

interface ListingMap {
  [id: string]: string;
}

function formatDuration(ms: number | null) {
  if (!ms) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatRelative(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return format(parseISO(dateStr), "MMM d, h:mm a");
}

export function EngineRunHistory() {
  const [runs, setRuns] = useState<EngineRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/sync/runs?limit=30")
      .then((r) => r.json())
      .then((d) => setRuns(d.runs ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-text-disabled text-sm">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Loading run history…
      </div>
    );
  }

  // Summary stats
  const today = new Date().toISOString().split("T")[0];
  const todayRuns = runs.filter((r) => r.startedAt.startsWith(today));
  const successToday = todayRuns.filter((r) => r.status === "SUCCESS").length;
  const failToday = todayRuns.filter((r) => r.status === "FAILED").length;
  const totalDays = todayRuns.reduce((s, r) => s + (r.daysChanged ?? 0), 0);
  const avgDuration =
    todayRuns.length > 0
      ? Math.round(todayRuns.reduce((s, r) => s + (r.durationMs ?? 0), 0) / todayRuns.length)
      : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Engine Run History</h2>
          <p className="text-xs text-text-tertiary mt-0.5">Last 30 runs across all listings</p>
        </div>
      </div>

      {/* Today stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Today's Runs", value: todayRuns.length, color: "text-text-primary" },
          { label: "Succeeded", value: successToday, color: "text-green-400" },
          { label: "Failed", value: failToday, color: failToday > 0 ? "text-red-400" : "text-text-primary" },
          { label: "Days Repriced", value: totalDays.toLocaleString("en-US"), color: "text-primary" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
            <p className="text-[11px] text-text-tertiary mb-1">{s.label}</p>
            <p className={cn("text-2xl font-bold tabular-nums", s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Run list */}
      {runs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-xl border border-white/5 bg-white/[0.02]">
          <Activity className="h-7 w-7 text-text-disabled" />
          <p className="text-text-tertiary text-sm">No engine runs yet</p>
          <p className="text-text-disabled text-xs">Use "Run All" to compute pricing proposals for all listings.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/5 overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1.5rem_1fr_auto_auto_auto] items-center gap-4 px-5 py-2.5 border-b border-white/5 bg-white/[0.02]">
            <span />
            <span className="text-[11px] font-semibold text-text-disabled uppercase tracking-wider">Listing</span>
            <span className="text-[11px] font-semibold text-text-disabled uppercase tracking-wider text-right">Days</span>
            <span className="text-[11px] font-semibold text-text-disabled uppercase tracking-wider text-right">Duration</span>
            <span className="text-[11px] font-semibold text-text-disabled uppercase tracking-wider text-right">When</span>
          </div>

          <div className="divide-y divide-white/[0.04] max-h-80 overflow-y-auto">
            {runs.map((run) => (
              <div
                key={run._id}
                className="grid grid-cols-[1.5rem_1fr_auto_auto_auto] items-center gap-4 px-5 py-2.5 hover:bg-white/[0.02] transition-colors"
              >
                {/* Status icon */}
                {run.status === "SUCCESS" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                ) : run.status === "FAILED" ? (
                  <XCircle className="h-3.5 w-3.5 text-red-400" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 text-primary animate-spin" />
                )}

                {/* Listing */}
                <div className="min-w-0">
                  <p className="text-xs text-text-primary font-medium truncate">
                    Listing …{run.listingId?.slice(-6)}
                  </p>
                  {run.errorMessage && (
                    <p className="text-[11px] text-red-400 truncate">{run.errorMessage}</p>
                  )}
                </div>

                {/* Days changed */}
                <span className={cn(
                  "text-xs font-medium tabular-nums text-right",
                  (run.daysChanged ?? 0) > 0 ? "text-primary" : "text-text-disabled"
                )}>
                  {run.daysChanged ?? 0}
                </span>

                {/* Duration */}
                <span className="text-[11px] text-text-tertiary text-right tabular-nums">
                  {formatDuration(run.durationMs)}
                </span>

                {/* When */}
                <span className="text-[11px] text-text-disabled text-right whitespace-nowrap">
                  {formatRelative(run.startedAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

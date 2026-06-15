"use client";

import { useEffect, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Play,
  Pause,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  Zap,
  Activity,
  BarChart2,
  GitBranch,
  Shield,
  Radio,
  Eye,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AgentData {
  id: string;
  name: string;
  role: string;
  status: "active" | "warning" | "error" | "idle";
  description: string;
  lastRunAt: string | null;
  lastRunStatus: string;
  metrics: Record<string, unknown>;
}

interface AgentStatusData {
  systemState: string;
  agents: AgentData[];
  summary: {
    totalAgents: number;
    activeCount: number;
    warningCount: number;
    errorCount: number;
    pendingProposals: number;
    criticalInsights: number;
    isStale: boolean;
    lastRunAt: string | null;
  };
}

const AGENT_ICONS: Record<string, any> = {
  cro: Zap,
  event_intelligence: Radio,
  pricing_optimizer: BarChart2,
  competitor_scanner: Eye,
  data_aggregator: GitBranch,
  adjustment_reviewer: Shield,
  channel_sync: Activity,
  anomaly_detector: AlertTriangle,
  reservation_agent: MessageSquare,
};

const STATE_COLORS: Record<string, string> = {
  connected: "text-blue-400",
  observing: "text-primary",
  simulating: "text-purple-400",
  active: "text-green-400",
  paused: "text-primary",
  error: "text-red-400",
};

const STATE_LABELS: Record<string, string> = {
  connected: "Connected",
  observing: "Observing",
  simulating: "Simulating",
  active: "Active",
  paused: "Paused",
  error: "Error",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  active: { label: "Active", color: "bg-green-500/15 text-green-400 border-green-500/20", icon: CheckCircle2 },
  warning: { label: "Warning", color: "bg-primary/15 text-primary border-primary/20", icon: AlertTriangle },
  error: { label: "Error", color: "bg-red-500/15 text-red-400 border-red-500/20", icon: XCircle },
  idle: { label: "Idle", color: "bg-white/5 text-text-tertiary border-white/10", icon: Clock },
};

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function AgentStatusPanel() {
  const [data, setData] = useState<AgentStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningAll, setRunningAll] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/status");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // silent — stale data shown
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleRunAll = async () => {
    setRunningAll(true);
    try {
      const res = await fetch("/api/engine/run-all", { method: "POST", body: JSON.stringify({ trigger: "manual" }), headers: { "Content-Type": "application/json" } });
      const json = await res.json();
      if (json.success) {
        toast.success(`Engine run complete — ${json.summary.succeeded}/${json.summary.totalListings} listings updated`);
        await fetchStatus();
      } else {
        toast.error(json.error || "Run failed");
      }
    } catch {
      toast.error("Failed to run engine");
    } finally {
      setRunningAll(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <RefreshCw className="h-5 w-5 animate-spin text-text-tertiary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-text-tertiary text-sm">Failed to load agent status.</p>
      </div>
    );
  }

  const { systemState, agents, summary } = data;
  const systemStates = ["connected", "observing", "simulating", "active", "paused"];

  return (
    <div className="space-y-6">
      {/* System State Machine */}
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">System State</h3>
            <p className="text-xs text-text-tertiary mt-0.5">
              Last run: {formatTimeAgo(summary.lastRunAt)}
              {summary.isStale && <span className="ml-2 text-primary">⚠ Data may be stale (&gt;4h)</span>}
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleRunAll}
            disabled={runningAll}
            className="bg-amber text-black hover:bg-amber/90 h-8 text-xs px-3 gap-1.5"
          >
            {runningAll ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {runningAll ? "Running…" : "Run All"}
          </Button>
        </div>

        {/* State Machine Steps */}
        <div className="flex items-center gap-0">
          {systemStates.map((state, i) => {
            const isActive = systemState === state;
            const isPast = systemStates.indexOf(systemState) > i;
            return (
              <div key={state} className="flex items-center flex-1">
                <div className="flex flex-col items-center gap-1 flex-1">
                  <div
                    className={cn(
                      "h-2 w-2 rounded-full border transition-all",
                      isActive
                        ? "bg-amber border-amber scale-125"
                        : isPast
                        ? "bg-green-500 border-green-500"
                        : "bg-white/10 border-white/20"
                    )}
                  />
                  <span
                    className={cn(
                      "text-[10px] font-medium whitespace-nowrap",
                      isActive ? "text-amber" : isPast ? "text-green-400" : "text-text-disabled"
                    )}
                  >
                    {STATE_LABELS[state]}
                  </span>
                </div>
                {i < systemStates.length - 1 && (
                  <div
                    className={cn(
                      "h-px flex-1 mx-1 -mt-3",
                      isPast || isActive ? "bg-amber/40" : "bg-white/10"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Active Agents", value: summary.activeCount, color: "text-green-400" },
          { label: "Warnings", value: summary.warningCount, color: "text-primary" },
          { label: "Pending Proposals", value: summary.pendingProposals, color: "text-blue-400" },
          { label: "Critical Insights", value: summary.criticalInsights, color: "text-red-400" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-center"
          >
            <div className={cn("text-2xl font-bold tabular-nums", stat.color)}>{stat.value}</div>
            <div className="text-[11px] text-text-tertiary mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Agent Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => {
          const Icon = AGENT_ICONS[agent.id] || Activity;
          const statusCfg = STATUS_CONFIG[agent.status] || STATUS_CONFIG.idle;
          const StatusIcon = statusCfg.icon;

          return (
            <div
              key={agent.id}
              className="rounded-xl border border-white/5 bg-white/[0.02] p-4 flex flex-col gap-3 hover:bg-white/[0.04] transition-colors"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 shrink-0">
                    <Icon className="h-4 w-4 text-amber" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-text-primary leading-tight">{agent.name}</div>
                    <div className="text-[11px] text-text-tertiary">{agent.role}</div>
                  </div>
                </div>
                <span
                  className={cn(
                    "shrink-0 flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                    statusCfg.color
                  )}
                >
                  <StatusIcon className="h-2.5 w-2.5" />
                  {statusCfg.label}
                </span>
              </div>

              {/* Description */}
              <p className="text-[11px] text-text-tertiary leading-relaxed">{agent.description}</p>

              {/* Footer */}
              <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px] text-text-disabled">
                <span>
                  {agent.lastRunStatus === "always_on"
                    ? "Always on"
                    : agent.lastRunStatus === "event_driven"
                    ? "Event-driven"
                    : agent.lastRunAt
                    ? formatTimeAgo(agent.lastRunAt)
                    : "Never run"}
                </span>
                {agent.metrics && Object.keys(agent.metrics).length > 0 && (
                  <span className="text-text-tertiary">
                    {agent.id === "adjustment_reviewer" &&
                      typeof agent.metrics.pendingProposals === "number" &&
                      `${agent.metrics.pendingProposals} pending`}
                    {agent.id === "anomaly_detector" &&
                      typeof agent.metrics.criticalInsights === "number" &&
                      agent.metrics.criticalInsights > 0 &&
                      `${agent.metrics.criticalInsights} critical`}
                    {agent.id === "event_intelligence" &&
                      typeof agent.metrics.isStale === "boolean" &&
                      agent.metrics.isStale &&
                      "⚠ Stale"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

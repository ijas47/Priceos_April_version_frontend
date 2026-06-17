"use client";

import { useState, useCallback } from "react";
import {
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Calendar,
  Zap,
  BarChart2,
  AlertTriangle,
  RefreshCw,
  Filter,
  Pencil,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────

type InsightSeverity = "high" | "medium" | "low";
type InsightStatus = "pending" | "approved" | "modified" | "rejected" | "snoozed" | "superseded";

interface InsightAction {
  type: "price_increase" | "price_decrease" | "gap_fill" | "min_stay_change" | "block" | "advisory";
  adjustPct?: number;
  absolutePrice?: number;
  dateRange?: { start: string; end: string };
  scope?: string;
}

interface Insight {
  id: string;
  category: string;
  severity: InsightSeverity;
  status: InsightStatus;
  title: string;
  summary: string;
  confidence: number;
  action: InsightAction | null;
  listingId: string | null;
  createdAt: string;
  snoozeUntil: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SEVERITY_STYLES: Record<InsightSeverity, string> = {
  high: "bg-red-500/10 text-red-400 border-red-500/20",
  medium: "bg-primary/10 text-primary border-primary/20",
  low: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  BOOKING_PACE: Zap,
  LEAD_TIME: Clock,
  CANCELLATION_RISK: AlertTriangle,
  OCCUPANCY: BarChart2,
  GAP_FILL: Calendar,
  LOS_OPTIMIZATION: BarChart2,
  COMPETITOR_RATE: TrendingUp,
  DAY_OF_WEEK: Calendar,
  REVIEW_SCORE: CheckCircle2,
  EVENT_IMPACT: Zap,
  SEASONAL_SHIFT: TrendingUp,
  CHANNEL_MIX: BarChart2,
};

const ACTION_LABEL: Record<string, string> = {
  price_increase: "Increase Price",
  price_decrease: "Decrease Price",
  gap_fill: "Fill Gap",
  min_stay_change: "Change Min Stay",
  block: "Block Dates",
  advisory: "Advisory",
};

const STATUS_FILTERS = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "snoozed", label: "Snoozed" },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCategory(cat: string) {
  return cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function confidenceColor(c: number) {
  if (c >= 0.8) return "text-green-400";
  if (c >= 0.6) return "text-primary";
  return "text-red-400";
}

// ── Insight Card ──────────────────────────────────────────────────────────────

function InsightCard({
  insight,
  onAction,
  onModify,
}: {
  insight: Insight;
  onAction: (id: string, status: InsightStatus) => Promise<void>;
  onModify: (id: string, adjustPct: number) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [acting, setActing] = useState(false);
  const [modifying, setModifying] = useState(false);
  const [modifyPct, setModifyPct] = useState<string>(
    insight.action?.adjustPct != null ? String(insight.action.adjustPct) : ""
  );
  const [savingModify, setSavingModify] = useState(false);

  const CategoryIcon = CATEGORY_ICONS[insight.category] ?? Zap;
  const isPending = insight.status === "pending";
  const hasAdjPct = insight.action?.adjustPct != null;

  const handleAction = async (status: InsightStatus) => {
    setActing(true);
    try {
      await onAction(insight.id, status);
    } finally {
      setActing(false);
    }
  };

  const handleSaveModify = async () => {
    const pct = parseFloat(modifyPct);
    if (isNaN(pct)) { toast.error("Enter a valid percentage."); return; }
    setSavingModify(true);
    try {
      await onModify(insight.id, pct);
      setModifying(false);
    } finally {
      setSavingModify(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border bg-white/[0.02] transition-colors",
        insight.severity === "high"
          ? "border-red-500/20"
          : insight.severity === "medium"
          ? "border-primary/10"
          : "border-white/5"
      )}
    >
      {/* Header Row */}
      <div className="flex items-start gap-3 px-5 py-4">
        {/* Icon */}
        <div
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            insight.severity === "high"
              ? "bg-red-500/10"
              : insight.severity === "medium"
              ? "bg-primary/10"
              : "bg-blue-500/10"
          )}
        >
          <CategoryIcon
            className={cn(
              "h-4 w-4",
              insight.severity === "high"
                ? "text-red-400"
                : insight.severity === "medium"
                ? "text-primary"
                : "text-blue-400"
            )}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-sm font-semibold text-text-primary truncate">{insight.title}</span>
            <span
              className={cn(
                "text-[10px] font-medium px-2 py-0.5 rounded-full border",
                SEVERITY_STYLES[insight.severity]
              )}
            >
              {insight.severity}
            </span>
            <span className="text-[10px] text-text-disabled border border-white/10 px-2 py-0.5 rounded-full">
              {formatCategory(insight.category)}
            </span>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed line-clamp-2">{insight.summary}</p>

          {/* Meta row */}
          <div className="flex items-center gap-3 mt-1.5">
            <span className={cn("text-[11px] font-medium tabular-nums", confidenceColor(insight.confidence))}>
              {Math.round(insight.confidence * 100)}% confidence
            </span>
            {insight.action && (
              <span className="text-[11px] text-text-tertiary flex items-center gap-1">
                {insight.action.type === "price_increase" ? (
                  <TrendingUp className="h-3 w-3 text-green-400" />
                ) : insight.action.type === "price_decrease" ? (
                  <TrendingDown className="h-3 w-3 text-red-400" />
                ) : null}
                {ACTION_LABEL[insight.action.type]}
                {insight.action.adjustPct != null && (
                  <strong className={insight.action.adjustPct > 0 ? "text-green-400" : "text-red-400"}>
                    {" "}{insight.action.adjustPct > 0 ? "+" : ""}{insight.action.adjustPct}%
                  </strong>
                )}
              </span>
            )}
            <span className="text-[11px] text-text-disabled ml-auto">
              {format(parseISO(insight.createdAt), "MMM d, h:mm a")}
            </span>
          </div>
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-text-disabled hover:text-text-secondary transition-colors"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Expanded details */}
      {expanded && insight.action && (
        <div className="mx-5 mb-3 rounded-lg bg-white/[0.03] border border-white/5 px-4 py-3 text-xs text-text-secondary space-y-1">
          <p className="font-medium text-text-primary">Recommended Action</p>
          <p>
            Type: <span className="text-text-primary">{ACTION_LABEL[insight.action.type]}</span>
          </p>
          {insight.action.adjustPct != null && (
            <p>
              Adjustment:{" "}
              <span
                className={cn(
                  "font-semibold",
                  insight.action.adjustPct > 0 ? "text-green-400" : "text-red-400"
                )}
              >
                {insight.action.adjustPct > 0 ? "+" : ""}{insight.action.adjustPct}%
              </span>
            </p>
          )}
          {insight.action.absolutePrice != null && (
            <p>
              Fixed Price: <span className="text-text-primary">{insight.action.absolutePrice.toLocaleString("en-US")}</span>
            </p>
          )}
          {insight.action.dateRange && (
            <p>
              Dates:{" "}
              <span className="text-text-primary">
                {insight.action.dateRange.start} → {insight.action.dateRange.end}
              </span>
            </p>
          )}
          {insight.action.scope && (
            <p>
              Scope: <span className="text-text-primary">{insight.action.scope}</span>
            </p>
          )}
        </div>
      )}

      {/* Action Buttons (only for pending) */}
      {isPending && (
        <div className="px-5 pb-4 pt-1 space-y-2">
          {/* Inline modify form */}
          {modifying && hasAdjPct && (
            <div className="flex items-center gap-2 rounded-lg bg-white/[0.03] border border-white/10 px-3 py-2">
              <span className="text-xs text-text-tertiary shrink-0">Adjust %:</span>
              <Input
                type="number"
                value={modifyPct}
                onChange={(e) => setModifyPct(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveModify();
                  if (e.key === "Escape") setModifying(false);
                }}
                className="h-6 w-24 text-xs bg-white/5 border-white/10 px-2"
                autoFocus
              />
              <Button
                size="sm"
                disabled={savingModify}
                onClick={handleSaveModify}
                className="h-6 px-2 text-xs bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20"
              >
                {savingModify ? <RefreshCw className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
              </Button>
              <Button
                size="sm"
                onClick={() => setModifying(false)}
                className="h-6 px-2 text-xs bg-white/5 text-text-disabled border border-white/10 hover:text-text-secondary"
              >
                <X className="h-3 w-3" />
              </Button>
              <span className="text-[10px] text-text-disabled">Enter to save · Esc to cancel</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={acting}
              onClick={() => handleAction("approved")}
              className="h-7 px-3 text-xs bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20"
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Approve
            </Button>
            {hasAdjPct && (
              <Button
                size="sm"
                disabled={acting}
                onClick={() => setModifying((v) => !v)}
                className={cn(
                  "h-7 px-3 text-xs border",
                  modifying
                    ? "bg-amber/10 text-amber border-amber/30"
                    : "bg-white/5 text-text-secondary border-white/10 hover:text-amber hover:border-amber/30"
                )}
              >
                <Pencil className="h-3 w-3 mr-1" />
                Modify
              </Button>
            )}
            <Button
              size="sm"
              disabled={acting}
              onClick={() => handleAction("snoozed")}
              className="h-7 px-3 text-xs bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20"
            >
              <Clock className="h-3 w-3 mr-1" />
              Snooze 7d
            </Button>
            <Button
              size="sm"
              disabled={acting}
              onClick={() => handleAction("rejected")}
              className="h-7 px-3 text-xs bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
            >
              <XCircle className="h-3 w-3 mr-1" />
              Dismiss
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Client Component ─────────────────────────────────────────────────────

export function InsightsClient({ initialInsights }: { initialInsights: Insight[] }) {
  const [insights, setInsights] = useState<Insight[]>(initialInsights);
  const [activeFilter, setActiveFilter] = useState<string>("pending");
  const [loading, setLoading] = useState(false);

  const fetchInsights = useCallback(async (status: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/insights?status=${status}&limit=50`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setInsights(data.insights ?? []);
    } catch {
      toast.error("Could not refresh insights.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleFilterChange = (status: string) => {
    setActiveFilter(status);
    fetchInsights(status);
  };

  const handleAction = useCallback(async (id: string, status: InsightStatus) => {
    const snoozeUntil =
      status === "snoozed"
        ? new Date(Date.now() + 7 * 86400000).toISOString()
        : undefined;

    const res = await fetch(`/api/insights/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...(snoozeUntil ? { snoozeUntil } : {}) }),
    });

    if (!res.ok) {
      toast.error("Action failed - please try again.");
      return;
    }

    const labels: Record<string, string> = {
      approved: "Insight approved.",
      rejected: "Insight dismissed.",
      snoozed: "Snoozed for 7 days.",
    };
    toast.success(labels[status] ?? "Done.");

    setInsights((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const handleModify = useCallback(async (id: string, adjustPct: number) => {
    const res = await fetch(`/api/insights/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "modified",
        modifiedAction: { adjustPct },
      }),
    });

    if (!res.ok) {
      toast.error("Failed to save modification.");
      return;
    }

    toast.success(`Insight modified to ${adjustPct > 0 ? "+" : ""}${adjustPct}% and approved.`);
    setInsights((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const displayed = insights.filter((i) => i.status === activeFilter);

  const pendingCount = insights.filter((i) => i.status === "pending").length;
  const highSeverityCount = insights.filter((i) => i.severity === "high" && i.status === "pending").length;

  return (
    <div className="p-8 max-w-4xl space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight mb-1">Insights</h1>
          <p className="text-text-secondary text-sm">
            AI-generated revenue opportunities - review, approve, or dismiss each recommendation.
          </p>
        </div>
        <Button
          onClick={() => fetchInsights(activeFilter)}
          disabled={loading}
          variant="outline"
          size="sm"
          className="gap-2 shrink-0"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Summary Banner */}
      {pendingCount > 0 && (
        <div className="rounded-xl border border-amber/20 bg-amber/5 px-5 py-3 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-amber shrink-0" />
          <p className="text-sm text-text-secondary">
            <strong className="text-amber">{pendingCount} pending insight{pendingCount !== 1 ? "s" : ""}</strong>
            {highSeverityCount > 0 && (
              <> · <strong className="text-red-400">{highSeverityCount} high severity</strong></>
            )}{" "}
            awaiting your review.
          </p>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 border-b border-border-default">
        {STATUS_FILTERS.map(({ id, label }) => {
          const count = initialInsights.filter((i) => i.status === id).length;
          return (
            <button
              key={id}
              onClick={() => handleFilterChange(id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeFilter === id
                  ? "border-amber text-amber"
                  : "border-transparent text-text-secondary hover:text-text-primary hover:border-border-default"
              )}
            >
              {label}
              {count > 0 && id === "pending" && (
                <span className="ml-1 rounded-full bg-amber text-black text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {count}
                </span>
              )}
            </button>
          );
        })}
        <div className="ml-auto pb-1 flex items-center gap-1 text-xs text-text-disabled">
          <Filter className="h-3 w-3" />
          {displayed.length} shown
        </div>
      </div>

      {/* Insight List */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-text-disabled text-sm gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading insights…
        </div>
      ) : displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <CheckCircle2 className="h-8 w-8 text-text-disabled" />
          <p className="text-text-tertiary text-sm">No {activeFilter} insights.</p>
          {activeFilter === "pending" && (
            <p className="text-text-disabled text-xs">
              All caught up! New insights will appear here when the AI engine detects opportunities.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map((insight) => (
            <InsightCard key={insight.id} insight={insight} onAction={handleAction} onModify={handleModify} />
          ))}
        </div>
      )}
    </div>
  );
}

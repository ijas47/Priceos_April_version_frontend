"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Database, Cpu, Activity, CheckCircle2, XCircle,
  Clock, RefreshCw, Play, Circle, Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Source {
  sourceId: string;
  name: string;
  description: string;
  scheduleLabel: string;
  isEnabled: boolean;
  lastRunAt: string | null;
  lastRunStatus: "success" | "error" | "running" | "idle";
  lastRunDurationMs: number | null;
  lastRunMetric: string | null;
  nextRunAt: string | null;
}

interface Detector {
  detectorId: string;
  name: string;
  category: string;
  triggerSource: string;
  description: string;
  isEnabled: boolean;
  lastTriggeredAt: string | null;
  lastSignalsFound: number;
}

interface EngineRun {
  _id: string;
  listingId: string;
  startedAt: string;
  status: "SUCCESS" | "FAILED" | "RUNNING";
  daysChanged: number;
  durationMs: number;
  errorMessage?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(ms: number | null) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatRelative(dateStr: string | null) {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return format(parseISO(dateStr), "MMM d");
}

const STATUS_ICON: Record<string, React.ElementType> = {
  success: CheckCircle2,
  SUCCESS: CheckCircle2,
  error: XCircle,
  FAILED: XCircle,
  running: RefreshCw,
  RUNNING: RefreshCw,
  idle: Circle,
};

const STATUS_COLOR: Record<string, string> = {
  success: "text-green-400",
  SUCCESS: "text-green-400",
  error: "text-red-400",
  FAILED: "text-red-400",
  running: "text-primary animate-spin",
  RUNNING: "text-primary animate-spin",
  idle: "text-text-disabled",
};

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "sources", label: "Sources", icon: Database },
  { id: "detectors", label: "Detectors", icon: Cpu },
  { id: "signals", label: "Engine Runs", icon: Activity },
] as const;

// ── Sources Tab ───────────────────────────────────────────────────────────────

function SourcesTab() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());

  const fetchSources = () => {
    fetch("/api/sync/sources")
      .then((r) => r.json())
      .then((d) => setSources(d.sources ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchSources(); }, []);

  // Poll every 4 s while any source is in running state
  useEffect(() => {
    const hasRunning = sources.some((s) => s.lastRunStatus === "running");
    if (!hasRunning && runningIds.size === 0) return;
    const timer = setInterval(fetchSources, 4000);
    return () => clearInterval(timer);
  }, [sources, runningIds]);

  const handleRun = async (sourceId: string) => {
    const res = await fetch("/api/sync/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId }),
    });
    if (res.ok) {
      toast.success(`${sourceId} sync triggered.`);
      setRunningIds((prev) => new Set(prev).add(sourceId));
      // Start polling; clear from set once source shows non-running
      const poll = setInterval(async () => {
        const r = await fetch("/api/sync/sources").then((x) => x.json());
        const updated: Source[] = r.sources ?? [];
        setSources(updated);
        const src = updated.find((s) => s.sourceId === sourceId);
        if (src && src.lastRunStatus !== "running") {
          setRunningIds((prev) => { const n = new Set(prev); n.delete(sourceId); return n; });
          clearInterval(poll);
        }
      }, 3000);
    } else {
      toast.error("Failed to trigger sync.");
    }
  };

  if (loading) return <LoadingState />;

  if (sources.length === 0) return (
    <EmptyState
      icon={Database}
      title="No sources configured"
      subtitle="Sources are configured in the seed script and updated by the Data Aggregator agent."
    />
  );

  return (
    <div className="space-y-3">
      {sources.map((s) => {
        const StatusIcon = STATUS_ICON[s.lastRunStatus] || Circle;
        return (
          <div key={s.sourceId} className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
            <div className="flex items-start gap-4">
              <div className="h-9 w-9 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <Database className="h-4 w-4 text-text-tertiary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-semibold text-text-primary">{s.name}</span>
                  <StatusIcon className={cn("h-3.5 w-3.5", STATUS_COLOR[s.lastRunStatus])} />
                  {s.isEnabled ? (
                    <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-[10px] border h-4">enabled</Badge>
                  ) : (
                    <Badge className="bg-white/5 text-text-disabled text-[10px] border border-white/5 h-4">disabled</Badge>
                  )}
                </div>
                <p className="text-xs text-text-tertiary mb-3">{s.description}</p>
                <div className="flex items-center gap-4 flex-wrap text-[11px] text-text-secondary">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {s.scheduleLabel}</span>
                  <span>Last: <strong className="text-text-primary">{formatRelative(s.lastRunAt)}</strong></span>
                  {s.lastRunDurationMs && <span>Duration: <strong className="text-text-primary">{formatDuration(s.lastRunDurationMs)}</strong></span>}
                  {s.lastRunMetric && <span className="text-primary">{s.lastRunMetric}</span>}
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => handleRun(s.sourceId)}
                disabled={runningIds.has(s.sourceId) || s.lastRunStatus === "running"}
                className="h-8 px-3 text-xs bg-white/5 hover:bg-white/10 text-text-secondary border border-white/10 gap-1.5 shrink-0"
              >
                {(runningIds.has(s.sourceId) || s.lastRunStatus === "running")
                  ? <RefreshCw className="h-3 w-3 animate-spin" />
                  : <Play className="h-3 w-3" />}
                {(runningIds.has(s.sourceId) || s.lastRunStatus === "running") ? "Running…" : "Run"}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Detectors Tab ─────────────────────────────────────────────────────────────

function DetectorsTab() {
  const [detectors, setDetectors] = useState<Detector[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/sync/detectors")
      .then((r) => r.json())
      .then((d) => setDetectors(d.detectors ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const CATEGORY_COLORS: Record<string, string> = {
    pricing: "bg-primary/10 text-primary border-primary/20",
    occupancy: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    event: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    competitor: "bg-green-500/10 text-green-400 border-green-500/20",
    anomaly: "bg-red-500/10 text-red-400 border-red-500/20",
  };

  if (loading) return <LoadingState />;
  if (detectors.length === 0) return (
    <EmptyState
      icon={Cpu}
      title="No detectors configured"
      subtitle="Detectors run after each source sync and surface signals for the AI agents."
    />
  );

  return (
    <div className="space-y-3">
      {detectors.map((d) => (
        <div key={d.detectorId} className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
          <div className="flex items-start gap-4">
            <div className="h-9 w-9 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
              <Cpu className="h-4 w-4 text-text-tertiary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-semibold text-text-primary">{d.name}</span>
                <span className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full border",
                  CATEGORY_COLORS[d.category] || "bg-white/5 text-text-disabled border-white/10"
                )}>{d.category}</span>
                {!d.isEnabled && (
                  <Badge className="bg-white/5 text-text-disabled text-[10px] border border-white/5 h-4">disabled</Badge>
                )}
              </div>
              <p className="text-xs text-text-tertiary mb-3">{d.description}</p>
              <div className="flex items-center gap-4 flex-wrap text-[11px] text-text-secondary">
                <span>Trigger: <strong className="text-text-primary">{d.triggerSource}</strong></span>
                <span>Last triggered: <strong className="text-text-primary">{formatRelative(d.lastTriggeredAt)}</strong></span>
                <span>Signals found: <strong className={d.lastSignalsFound > 0 ? "text-primary" : "text-text-primary"}>{d.lastSignalsFound}</strong></span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Engine Runs Tab ───────────────────────────────────────────────────────────

function EngineRunsTab() {
  const [runs, setRuns] = useState<EngineRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const fetchRuns = () => {
    setLoading(true);
    fetch("/api/sync/runs?limit=50")
      .then((r) => r.json())
      .then((d) => setRuns(d.runs ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(fetchRuns, []);

  const handleRunAll = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/engine/run-all", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Engine ran for ${data.summary?.totalListings ?? 0} listings. ${data.summary?.succeeded ?? 0} succeeded.`);
        setTimeout(fetchRuns, 1500);
      } else {
        toast.error("Engine run failed.");
      }
    } catch {
      toast.error("Network error.");
    } finally {
      setRunning(false);
    }
  };

  // Stats
  const today = new Date().toISOString().split("T")[0];
  const todayRuns = runs.filter((r) => r.startedAt.startsWith(today));
  const successCount = todayRuns.filter((r) => r.status === "SUCCESS").length;
  const failCount = todayRuns.filter((r) => r.status === "FAILED").length;
  const totalDaysChanged = todayRuns.reduce((s, r) => s + (r.daysChanged ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Today's Runs", value: todayRuns.length, color: "text-text-primary" },
          { label: "Succeeded", value: successCount, color: "text-green-400" },
          { label: "Failed", value: failCount, color: failCount > 0 ? "text-red-400" : "text-text-primary" },
          { label: "Days Repriced", value: totalDaysChanged.toLocaleString("en-US"), color: "text-primary" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
            <p className="text-[11px] text-text-tertiary mb-1">{s.label}</p>
            <p className={cn("text-2xl font-bold tabular-nums", s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Run All button */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-tertiary">Showing last 50 engine runs across all listings.</p>
        <Button
          onClick={handleRunAll}
          disabled={running}
          className="bg-amber text-black hover:bg-amber/90 gap-2 h-8 text-xs"
        >
          <Zap className={cn("h-3.5 w-3.5", running && "animate-pulse")} />
          {running ? "Running…" : "Run Engine Now"}
        </Button>
      </div>

      {/* Run list */}
      {loading ? <LoadingState /> : runs.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No engine runs yet"
          subtitle="Click 'Run Engine Now' to compute pricing proposals for all listings."
        />
      ) : (
        <div className="rounded-xl border border-white/5 overflow-hidden">
          <div className="divide-y divide-white/[0.04]">
            {runs.map((run) => {
              const StatusIcon = STATUS_ICON[run.status] || Circle;
              return (
                <div key={run._id} className="flex items-center gap-4 px-5 py-3 hover:bg-white/[0.02] transition-colors">
                  <StatusIcon className={cn("h-4 w-4 shrink-0", STATUS_COLOR[run.status])} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-text-primary truncate">
                      Listing {run.listingId?.slice(-6)}
                    </p>
                    {run.errorMessage && (
                      <p className="text-[11px] text-red-400 truncate mt-0.5">{run.errorMessage}</p>
                    )}
                  </div>
                  <div className="text-right text-[11px] text-text-tertiary shrink-0 space-y-0.5">
                    {run.daysChanged != null && (
                      <p className="text-primary font-medium">{run.daysChanged} days</p>
                    )}
                    <p>{formatDuration(run.durationMs)}</p>
                    <p>{formatRelative(run.startedAt)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-16 gap-2 text-text-disabled text-sm">
      <RefreshCw className="h-4 w-4 animate-spin" />
      Loading…
    </div>
  );
}

function EmptyState({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
      <Icon className="h-8 w-8 text-text-disabled" />
      <p className="text-text-tertiary text-sm font-medium">{title}</p>
      <p className="text-text-disabled text-xs max-w-xs">{subtitle}</p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

import { Suspense } from "react";

function SyncPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = (searchParams.get("tab") || "sources") as "sources" | "detectors" | "signals";
  const [importing, setImporting] = useState(false);

  const setTab = (id: string) => router.push(`/sync?tab=${id}`);

  const handleHostawayImport = async () => {
    setImporting(true);
    toast.info("Importing from Hostaway — this can take a few minutes for large portfolios…");
    try {
      const res = await fetch("/api/sync/trigger", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        toast.success("Hostaway import complete! Your properties are now in PriceOS.");
        router.push("/properties");
      } else {
        toast.error(data.message || data.error || "Hostaway import failed.");
      }
    } catch {
      toast.error("Network error during Hostaway import.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight mb-1">Pipeline</h1>
          <p className="text-text-secondary text-sm">
            Data sources, signal detectors, and pricing engine run history.
          </p>
        </div>
        <Button
          onClick={handleHostawayImport}
          disabled={importing}
          className="bg-amber text-black hover:bg-amber/90 gap-2 shrink-0"
        >
          <RefreshCw className={cn("h-4 w-4", importing && "animate-spin")} />
          {importing ? "Importing…" : "Import from Hostaway"}
        </Button>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border-default">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === id
                ? "border-amber text-amber"
                : "border-transparent text-text-secondary hover:text-text-primary hover:border-border-default"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "sources" && <SourcesTab />}
      {tab === "detectors" && <DetectorsTab />}
      {tab === "signals" && <EngineRunsTab />}
    </div>
  );
}

export default function SyncPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <SyncPageContent />
    </Suspense>
  );
}

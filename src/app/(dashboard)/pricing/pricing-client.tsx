"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO, differenceInDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  RefreshCcw,
  ChevronDown,
  ChevronUp,
  XCircle,
  AlertTriangle,
  Clock,
  Building2,
  ArrowUpDown,
  Pencil,
  X,
  Upload,
  Zap,
  Maximize2,
  Activity,
  Info,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { backendFetch } from "@/lib/api/backend-client";
// import { LiveInferenceFlowGraph, FlowStage } from "@/components/chat/live-inference-flow-graph";
export interface FlowStage {
  id: string;
  label: string;
  status: "pending" | "active" | "done" | "failed";
}
// readSSEStream removed - engine/run-all returns JSON, not SSE
import { SUPPORT_AGENT_STREAM_EVENT, SupportAgentStreamEventPayload } from "@/lib/chat/inference-events";
import { useLyzrAgentEvents } from "@/hooks/use-lyzr-agent-events";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProposalData = {
  id: string;
  listingId: string;
  date: string;
  currentPrice: string;
  proposedPrice: string | null;
  elasticityPrice?: string | null;
  elasticityWeight?: number | null;
  pBook?: number | null;
  changePct: number | null;
  reasoning: any;
  minStay: number | null;
  maxStay: number | null;
  closedToArrival: boolean;
  closedToDeparture: boolean;
  proposalStatus: string;
  listingName: string;
  currencyCode?: string;
};

type StatusTab = "pending" | "approved" | "rejected" | "pushed";
type SortKey = "date" | "changePct" | "property";

// ── Helpers ───────────────────────────────────────────────────────────────────

// PRD Agent 6 Approval Classification Rules (page 13):
// < 5% no event context = Low (auto-approve)
// 5–15% single signal   = Medium (human approval)
// > 15% any level       = High (human approval)
function riskLevel(pct: number | null): "high" | "medium" | "low" {
  const abs = Math.abs(pct ?? 0);
  if (abs > 15) return "high";
  if (abs >= 5) return "medium";
  return "low";
}

function isStale(dateStr: string): boolean {
  try {
    return differenceInDays(parseISO(dateStr), new Date()) <= 1;
  } catch {
    return false;
  }
}

function fmtDate(dateStr: string) {
  try {
    return format(parseISO(dateStr), "EEE, d MMM");
  } catch {
    return dateStr;
  }
}

function reasoningToText(reasoning: unknown): string {
  if (!reasoning) return "";
  if (typeof reasoning === "string") return reasoning;
  if (typeof reasoning === "object") {
    return Object.values(reasoning as Record<string, string>)
      .filter(Boolean)
      .join(" | ");
  }
  return String(reasoning);
}

function hasMarketReasoning(reasoning: unknown): boolean {
  return reasoningToText(reasoning).includes("[MARKET]");
}

function parseReasoningSegments(text: string): string[] {
  return text.split(/;\s*/).filter(Boolean);
}

function isMarketSegment(segment: string): boolean {
  return segment.trimStart().startsWith("[MARKET]");
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct === null || pct === 0)
    return <span className="text-muted-foreground text-xs">-</span>;
  const up = pct > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-bold tabular-nums",
        up ? "text-green-400" : "text-red-400"
      )}
    >
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? "+" : ""}
      {pct}%
    </span>
  );
}

function OptimizedPriceInfo({ row }: { row: ProposalData }) {
  if (row.elasticityPrice == null) return null;
  const optimal = Number(row.elasticityPrice);
  if (!Number.isFinite(optimal) || optimal <= 0) return null;

  const conf = Math.round((row.elasticityWeight ?? 0) * 100);
  const currency = row.currencyCode || "AED";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-violet-400/90 hover:text-violet-300"
          aria-label="Aria revenue-optimized price details"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
        <p className="font-medium text-violet-300">Aria revenue-optimized price</p>
        <p className="mt-1 text-muted-foreground">
          {currency} {optimal.toLocaleString("en-US")} · elasticity + demand · {conf}% confidence
        </p>
        <p className="mt-1 text-muted-foreground/80">
          Confidence rises as booking history grows.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function RiskBadge({ pct }: { pct: number | null }) {
  const level = riskLevel(pct);
  const styles = {
    high: "bg-red-500/10 text-red-400 border-red-500/20",
    medium: "bg-primary/10 text-primary border-primary/20",
    low: "bg-green-500/10 text-green-400 border-green-500/20",
  };
  return (
    <span
      className={cn(
        "text-[9px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wide",
        styles[level]
      )}
    >
      {level}
    </span>
  );
}

function ReasoningCell({ reasoning }: { reasoning: any }) {
  const [open, setOpen] = useState(false);
  const text = useMemo(() => reasoningToText(reasoning), [reasoning]);
  if (!text) return <span className="text-muted-foreground text-xs">-</span>;

  const segments = parseReasoningSegments(text);
  const marketSegments = segments.filter(isMarketSegment);
  const otherSegments = segments.filter((s) => !isMarketSegment(s));
  const visibleMarket = open ? marketSegments : marketSegments.slice(0, 2);
  const visibleOther = open ? otherSegments : otherSegments.slice(0, 1);
  const hiddenCount =
    segments.length - visibleMarket.length - visibleOther.length;

  return (
    <div className="space-y-1.5 text-xs leading-relaxed">
      {marketSegments.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {visibleMarket.map((segment, i) => (
            <span
              key={`m-${i}`}
              className="inline-flex items-center gap-1 rounded border border-cyan-500/25 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-300"
              title={segment}
            >
              <Activity className="h-2.5 w-2.5 shrink-0 text-cyan-400/90" />
              <span className="line-clamp-2">{segment.replace(/^\[MARKET\]\s*/, "")}</span>
            </span>
          ))}
        </div>
      )}
      {visibleOther.length > 0 && (
        <div className="space-y-0.5 text-foreground/70">
          {visibleOther.map((segment, i) => (
            <p key={`o-${i}`} className="line-clamp-2">
              {segment}
            </p>
          ))}
        </div>
      )}
      {hiddenCount > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          className="inline-flex items-center gap-0.5 text-primary hover:text-primary dark:text-amber/80 dark:hover:text-amber"
        >
          {open ? (
            <>
              <ChevronUp className="h-3 w-3" />
              less
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              {hiddenCount} more
            </>
          )}
        </button>
      )}
    </div>
  );
}

function ConstraintBadges({ row }: { row: ProposalData }) {
  const tags: { label: string; color: string }[] = [];
  if (row.minStay && row.minStay > 1)
    tags.push({
      label: `${row.minStay}N min`,
      color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    });
  if (row.maxStay && row.maxStay < 30)
    tags.push({
      label: `${row.maxStay}N max`,
      color: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    });
  if (row.closedToArrival)
    tags.push({
      label: "No arrival",
      color: "bg-red-500/10 text-red-400 border-red-500/20",
    });
  if (row.closedToDeparture)
    tags.push({
      label: "No depart",
      color: "bg-red-500/10 text-red-400 border-red-500/20",
    });
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {tags.map((t) => (
        <span
          key={t.label}
          className={cn("text-[9px] font-medium px-1.5 py-0.5 rounded border", t.color)}
        >
          {t.label}
        </span>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function PricingClient({
  initialProposals,
  allListings = [],
  orgId,
}: {
  initialProposals: ProposalData[];
  allListings?: { id: string; name: string }[];
  orgId: string;
}) {
  const router = useRouter();
  const [proposals, setProposals] = useState<ProposalData[]>(initialProposals);
  const [loadingProposals, setLoadingProposals] = useState(initialProposals.length === 0);
  const [activeTab, setActiveTab] = useState<StatusTab>("pending");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (initialProposals.length > 0) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/revenue/proposals?status=all");
        if (!res.ok) return;
        const data = (await res.json()) as { proposals?: ProposalData[] };
        if (!cancelled) setProposals(data.proposals ?? []);
      } catch {
        if (!cancelled) setProposals([]);
      } finally {
        if (!cancelled) setLoadingProposals(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialProposals.length]);

  // ── Live Graph State ───────────────────────────────────────────────────────
  const [showLiveGraph, setShowLiveGraph] = useState(false);
  const [isGraphProcessing, setIsGraphProcessing] = useState(false);
  const [isGraphExpanded, setIsGraphExpanded] = useState(false);
  const [graphSessionId, setGraphSessionId] = useState<string>("pricing-idle");
  const [graphStages, setGraphStages] = useState<FlowStage[]>([
    { id: "routing", label: "Router", status: "pending" },
    { id: "analyzing", label: "Analysis", status: "pending" },
    { id: "validating", label: "Pricing Guard", status: "pending" },
    { id: "generating", label: "Generator", status: "pending" },
  ]);

  const { isConnected: isGraphConnected, events: graphEvents } = useLyzrAgentEvents(
    graphSessionId,
    isGraphProcessing
  );

  const GRAPH_STAGES = [
    { id: "routing", label: "Router" },
    { id: "analyzing", label: "Analysis" },
    { id: "validating", label: "Pricing Guard" },
    { id: "generating", label: "Generator" },
  ];

  // Modify state - inline price edit
  const [modifyingId, setModifyingId] = useState<string | null>(null);
  const [modifyPrice, setModifyPrice] = useState("");
  const [isSavingModify, setIsSavingModify] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateProposals = async () => {
    setIsGenerating(true);
    setShowLiveGraph(true);
    setIsGraphProcessing(true);
    setGraphStages(GRAPH_STAGES.map(s => ({ ...s, status: "pending" as const })));

    const currentSessionId = `pricing-run-${Date.now()}`;
    setGraphSessionId(currentSessionId);

    const emitEvent = (msg: string, type: string, status: string) => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent<SupportAgentStreamEventPayload>(SUPPORT_AGENT_STREAM_EVENT, {
          detail: {
            sessionId: currentSessionId,
            event: { timestamp: new Date().toISOString(), event_type: type, message: msg, status } as any,
          }
        }));
      }
    };

    const advanceStage = (stageId: string) => {
      setGraphStages(prev => prev.map(s => {
        if (s.id === stageId) return { ...s, status: "active" };
        const currentIndex = GRAPH_STAGES.findIndex(gs => gs.id === stageId);
        const stageIndex = GRAPH_STAGES.findIndex(gs => gs.id === s.id);
        if (stageIndex < currentIndex) return { ...s, status: "done" };
        return s;
      }));
    };

    try {
      advanceStage("routing");
      emitEvent("Starting pricing engine…", "agent_thinking", "active");

      const response = await fetch(`/api/engine/run-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed to run engine");
      }

      advanceStage("analyzing");
      emitEvent("Analyzing listings…", "agent_thinking", "active");

      const data = await response.json();

      advanceStage("validating");
      emitEvent(`Processed ${data.summary?.totalListings ?? 0} listings`, "agent_thinking", "active");

      advanceStage("generating");

      setGraphStages(prev => prev.map(s => ({ ...s, status: "done" })));
      const changed = data.summary?.totalDaysChanged ?? 0;
      const succeeded = data.summary?.succeeded ?? 0;
      const blocked = data.summary?.blocked ?? 0;
      if (blocked > 0) {
        toast.warning("Engine run finished with data-quality blocks", {
          description: `${succeeded} priced · ${blocked} blocked (fix Hostaway/calendar) · ${changed} proposal-days`,
        });
      } else {
        toast.success("Proposal generation complete", {
          description: `${succeeded} properties · ${changed} day-level proposals created`,
        });
      }
      emitEvent("Generation Complete", "output_generated", "done");

      setTimeout(async () => {
        setIsGraphProcessing(false);
        setShowLiveGraph(false);
        try {
          const res = await fetch("/api/v1/revenue/proposals?status=all");
          if (res.ok) {
            const payload = (await res.json()) as { proposals?: ProposalData[] };
            setProposals(payload.proposals ?? []);
          }
        } catch {
          // keep existing rows if refresh fails
        }
        router.refresh();
      }, 1500);
    } catch (error) {
      toast.error((error as Error).message || "Network error - please try again.");
      setIsGraphProcessing(false);
    } finally {
      setIsGenerating(false);
    }
  };

  // Filters
  const [filterProperty, setFilterProperty] = useState("all");
  const [filterDirection, setFilterDirection] = useState<"all" | "up" | "down">("all");
  const [filterMarket, setFilterMarket] = useState<"all" | "market">("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Unique properties for filter dropdown - prefer full listings list, fall back to proposal names
  const propertyOptions = useMemo(() => {
    if (allListings.length > 0) return [...allListings].sort((a, b) => a.name.localeCompare(b.name));
    const names = [...new Set(proposals.map((p) => p.listingName))].sort();
    return names.map((name) => ({ id: name, name }));
  }, [allListings, proposals]);

  // Filtered + sorted proposals for current tab
  const displayProposals = useMemo(() => {
    let list = proposals.filter((p) => p.proposalStatus === activeTab);

    if (filterProperty !== "all") {
      list = list.filter((p) => p.listingName === filterProperty);
    }
    if (activeTab === "pending") {
      if (filterDirection === "up") list = list.filter((p) => (p.changePct ?? 0) > 0);
      if (filterDirection === "down") list = list.filter((p) => (p.changePct ?? 0) < 0);
    }
    if (filterMarket === "market") {
      list = list.filter((p) => hasMarketReasoning(p.reasoning));
    }

    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date") cmp = a.date.localeCompare(b.date);
      else if (sortKey === "changePct")
        cmp = (Math.abs(a.changePct ?? 0)) - (Math.abs(b.changePct ?? 0));
      else if (sortKey === "property")
        cmp = a.listingName.localeCompare(b.listingName);
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [proposals, activeTab, filterProperty, filterDirection, filterMarket, sortKey, sortDir]);

  // Tab counts
  const counts = useMemo(
    () => ({
      pending: proposals.filter((p) => p.proposalStatus === "pending").length,
      approved: proposals.filter((p) => p.proposalStatus === "approved").length,
      rejected: proposals.filter((p) => p.proposalStatus === "rejected").length,
      pushed: proposals.filter((p) => p.proposalStatus === "pushed").length,
    }),
    [proposals]
  );

  // Pending KPIs
  const pendingList = proposals.filter((p) => p.proposalStatus === "pending");
  const increases = pendingList.filter((p) => (p.changePct ?? 0) > 0).length;
  const decreases = pendingList.filter((p) => (p.changePct ?? 0) < 0).length;
  const marketAdjusted = pendingList.filter((p) => hasMarketReasoning(p.reasoning)).length;
  const tabMarketAdjusted = useMemo(
    () => proposals.filter((p) => p.proposalStatus === activeTab && hasMarketReasoning(p.reasoning)).length,
    [proposals, activeTab]
  );
  const avgDelta =
    pendingList.length > 0
      ? Math.round(
          pendingList.reduce((s, p) => s + (p.changePct ?? 0), 0) / pendingList.length
        )
      : 0;

  // Selection helpers
  const pendingDisplay = displayProposals.filter((p) => p.proposalStatus === "pending");
  const rejectedDisplay = displayProposals.filter((p) => p.proposalStatus === "rejected");
  const approvedDisplay = displayProposals.filter((p) => p.proposalStatus === "approved");
  const selectableDisplay = activeTab === "pending" ? pendingDisplay : activeTab === "rejected" ? rejectedDisplay : [];
  const toggleSelectAll = () => {
    setSelectedIds(
      selectedIds.size === selectableDisplay.length
        ? new Set()
        : new Set(selectableDisplay.map((p) => p.id))
    );
  };
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const handleBulkAction = async (action: "approve" | "reject") => {
    if (selectedIds.size === 0) return;
    setIsProcessing(true);
    const ids = Array.from(selectedIds);
    try {
      const res = await fetch(`/api/proposals/bulk-${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalIds: ids }),
      });
      if (!res.ok) throw new Error();
      const { count } = await res.json();
      toast.success(`${count} proposals ${action}d and saved to MongoDB.`);
      setProposals((prev) =>
        prev.map((p) =>
          selectedIds.has(p.id)
            ? { ...p, proposalStatus: action === "approve" ? "approved" : "rejected" }
            : p
        )
      );
      setSelectedIds(new Set());
    } catch {
      toast.error(`Failed to ${action} proposals.`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSingleAction = async (id: string, action: "approve" | "reject") => {
    try {
      const res = await fetch(`/api/proposals/bulk-${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalIds: [id] }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Proposal ${action}d and saved to MongoDB.`);
      setProposals((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, proposalStatus: action === "approve" ? "approved" : "rejected" }
            : p
        )
      );
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch {
      toast.error(`Failed to ${action} proposal.`);
    }
  };

  const handlePushAction = async (ids: string[]) => {
    if (ids.length === 0) return;
    setIsProcessing(true);
    try {
      const res = await fetch("/api/v1/revenue/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _ids: ids, action: "push" }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || payload?.message || "Failed to push proposals");
      setProposals((prev) =>
        prev.map((p) => (ids.includes(p.id) ? { ...p, proposalStatus: "pushed" } : p))
      );
      setSelectedIds(new Set());
      toast.success(`${ids.length} approved proposal${ids.length > 1 ? "s" : ""} pushed to MongoDB.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to push proposals.");
    } finally {
      setIsProcessing(false);
    }
  };

  const openModify = (row: ProposalData) => {
    setModifyingId(row.id);
    setModifyPrice(row.proposedPrice ?? row.currentPrice);
  };

  const cancelModify = () => {
    setModifyingId(null);
    setModifyPrice("");
  };

  const handleModify = async (id: string) => {
    const price = Number(modifyPrice);
    if (!price || price <= 0) {
      toast.error("Enter a valid price.");
      return;
    }
    setIsSavingModify(true);
    try {
      const res = await fetch("/api/proposals/bulk-modify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalIds: [id], newPrice: price }),
      });
      if (!res.ok) throw new Error();
      const current = proposals.find((p) => p.id === id)?.currentPrice ?? "0";
      const changePct = Number(current) > 0
        ? Math.round(((price - Number(current)) / Number(current)) * 100)
        : null;
      const currency = proposals.find((p) => p.id === id)?.currencyCode || "AED";
      toast.success(`Price modified to ${currency} ${price.toLocaleString("en-US")} and saved.`);
      setProposals((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, proposedPrice: String(price), changePct } : p
        )
      );
      cancelModify();
    } catch {
      toast.error("Failed to save modified price.");
    } finally {
      setIsSavingModify(false);
    }
  };

  const cycleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const STATUS_TABS: { id: StatusTab; label: string; color: string }[] = [
    { id: "pending", label: "Pending", color: "text-primary" },
    { id: "approved", label: "Approved", color: "text-green-400" },
    { id: "rejected", label: "Rejected", color: "text-red-400" },
    { id: "pushed", label: "Pushed", color: "text-blue-400" },
  ];

  return (
    <TooltipProvider delayDuration={200}>
    <div className="space-y-5">
      {/* KPI Strip - pending only */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Pending", value: counts.pending, color: "text-primary" },
          { label: "Increases", value: increases, color: "text-green-400" },
          { label: "Decreases", value: decreases, color: "text-red-400" },
          { label: "Market-adjusted", value: marketAdjusted, color: "text-cyan-400" },
          {
            label: "Avg Change",
            value: `${avgDelta > 0 ? "+" : ""}${avgDelta}%`,
            color: avgDelta >= 0 ? "text-green-400" : "text-red-400",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-border/70 bg-card px-4 py-3 shadow-sm dark:border-white/10 dark:bg-white/[0.03]"
          >
            <p className="text-[11px] text-muted-foreground mb-1 font-medium">{s.label}</p>
            <p className={cn("text-2xl font-bold tabular-nums text-foreground", s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Status Tabs + Generate button */}
      <div className="flex items-center gap-1 border-b border-border/70 dark:border-white/10">
        {STATUS_TABS.map(({ id, label, color }) => (
          <button
            key={id}
            onClick={() => { setActiveTab(id); setSelectedIds(new Set()); }}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === id
                ? `border-current ${color}`
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
            {counts[id] > 0 && (
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                  activeTab === id ? "bg-foreground/10 text-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                {counts[id]}
              </span>
            )}
          </button>
        ))}
        <div className="ml-auto pb-px">
          <Button
            size="sm"
            onClick={handleGenerateProposals}
            disabled={isGenerating}
            className="h-7 px-3 text-xs bg-amber text-black hover:bg-amber/90 gap-1.5"
          >
            {isGenerating
              ? <RefreshCcw className="h-3.5 w-3.5 animate-spin" />
              : <Zap className="h-3.5 w-3.5" />}
            {isGenerating ? "Generating…" : "Generate Proposals"}
          </Button>
        </div>
      </div>

      {/* Filter + Sort Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <Select value={filterProperty} onValueChange={setFilterProperty}>
          <SelectTrigger className="h-8 w-44 text-xs bg-background border-border/70 text-foreground shadow-sm">
            <SelectValue placeholder="All properties" />
          </SelectTrigger>
          <SelectContent className="max-h-64 overflow-y-auto">
            <SelectItem value="all" className="text-xs">All properties</SelectItem>
            {propertyOptions.map((p) => (
              <SelectItem key={p.id} value={p.name} className="text-xs">{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {activeTab === "pending" && (
          <Select value={filterDirection} onValueChange={(v) => setFilterDirection(v as typeof filterDirection)}>
            <SelectTrigger className="h-8 w-36 text-xs bg-background border-border/70 text-foreground shadow-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All directions</SelectItem>
              <SelectItem value="up" className="text-xs">Increases only</SelectItem>
              <SelectItem value="down" className="text-xs">Decreases only</SelectItem>
            </SelectContent>
          </Select>
        )}

        <button
          type="button"
          onClick={() => setFilterMarket((v) => (v === "all" ? "market" : "all"))}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
            filterMarket === "market"
              ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
              : "border-border/70 bg-background text-foreground hover:border-border"
          )}
        >
          <Activity className="h-3.5 w-3.5" />
          Market-adjusted
          {tabMarketAdjusted > 0 && (
            <span className="rounded-full bg-foreground/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
              {tabMarketAdjusted}
            </span>
          )}
        </button>

        <div className="ml-auto flex items-center gap-2 rounded-xl border border-border/70 bg-background px-2 py-1 shadow-sm">
          <span className="text-[11px] font-semibold text-foreground">Sort:</span>
          {(["date", "changePct", "property"] as SortKey[]).map((key) => (
            <button
              key={key}
              onClick={() => cycleSort(key)}
              className={cn(
                "flex items-center gap-0.5 text-[11px] px-2.5 py-1 rounded-md border transition-colors font-medium",
                sortKey === key
                  ? "border-amber/40 bg-amber/10 text-amber"
                  : "border-border/60 bg-muted/30 text-foreground hover:border-border"
              )}
            >
              {key === "date" ? "Date" : key === "changePct" ? "Change %" : "Property"}
              {sortKey === key && (
                <ArrowUpDown className="h-2.5 w-2.5" />
              )}
            </button>
          ))}
          <button
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            className="text-[11px] px-2.5 py-1 rounded-md border border-border/60 bg-muted/30 text-foreground font-medium hover:border-border"
          >
            {sortDir === "asc" ? "↑ Asc" : "↓ Desc"}
          </button>
        </div>
      </div>

      {/* Bulk action bar - shown for pending/rejected selections */}
      {(activeTab === "pending" || activeTab === "rejected") && selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber/30 bg-amber/5 px-4 py-2.5">
          <span className="text-xs font-semibold text-amber">
            {selectedIds.size} of {selectableDisplay.length} selected
          </span>
          <div className="flex items-center gap-2 ml-auto">
            {activeTab === "pending" && (
              <Button
                variant="outline"
                size="sm"
                disabled={isProcessing}
                onClick={() => handleBulkAction("reject")}
                className="h-7 px-3 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10 gap-1.5"
              >
                <XCircle className="h-3.5 w-3.5" />
                Reject
              </Button>
            )}
            <Button
              size="sm"
              disabled={isProcessing}
              onClick={() => handleBulkAction("approve")}
              className="h-7 px-3 text-xs bg-amber text-black hover:bg-amber/90 gap-1.5"
            >
              {isProcessing ? (
                <RefreshCcw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              {activeTab === "rejected" ? "Approve Rejected" : "Approve"}
            </Button>
          </div>
        </div>
      )}

      {activeTab === "approved" && approvedDisplay.length > 0 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            disabled={approvedDisplay.length === 0 || isProcessing}
            onClick={() => handlePushAction(approvedDisplay.map((p) => p.id))}
            className="h-8 px-4 text-xs bg-blue-600 text-white hover:bg-blue-500 gap-1.5"
          >
            {isProcessing ? (
              <RefreshCcw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            Push All Approved
          </Button>
        </div>
      )}

      {/* Proposal List */}
      {loadingProposals ? (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground rounded-2xl border border-border/70 bg-card shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading proposals…</span>
        </div>
      ) : displayProposals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-2xl border border-border/70 bg-card shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
          <CheckCircle2 className="h-8 w-8 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">
            {activeTab === "pending"
              ? "No pending proposals - all caught up."
              : `No ${activeTab} proposals in the last 14 days.`}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border/70 overflow-hidden bg-card shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
          <div className="overflow-x-auto overflow-y-auto max-h-[70vh] scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
          <Table>
            <TableHeader className="bg-muted/50 dark:bg-white/[0.04] sticky top-0 z-10">
              <TableRow className="border-border/70 dark:border-white/10 hover:bg-transparent">
                {(activeTab === "pending" || activeTab === "rejected") && (
                  <TableHead className="w-10 pl-4">
                    <Checkbox
                      checked={selectedIds.size === selectableDisplay.length && selectableDisplay.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                )}
                <TableHead className="w-[110px] text-xs font-semibold text-foreground pl-4">Date</TableHead>
                <TableHead className="min-w-[180px] text-xs font-semibold text-foreground">Property</TableHead>
                <TableHead className="w-[180px] text-xs font-semibold text-foreground">Price</TableHead>
                <TableHead className="w-[80px] text-center text-xs font-semibold text-foreground">Risk</TableHead>
                <TableHead className="min-w-[220px] text-xs font-semibold text-foreground">Reasoning</TableHead>
                {(activeTab === "pending" || activeTab === "approved" || activeTab === "rejected") && (
                  <TableHead className="w-[200px] text-right text-xs font-semibold text-foreground pr-4">Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
            {displayProposals.map((row) => {
              const stale = activeTab === "pending" && isStale(row.date);

              return (
                <TableRow
                  key={row.id}
                  className={cn(
                    "border-border/60 hover:bg-muted/35 dark:border-white/[0.06] dark:hover:bg-white/[0.03] align-middle",
                    stale && "border-l-2 border-l-amber/40"
                  )}
                >
                  {/* Checkbox */}
                  {(activeTab === "pending" || activeTab === "rejected") && (
                    <TableCell className="w-10 pl-4">
                      <Checkbox
                        checked={selectedIds.has(row.id)}
                        onCheckedChange={() => toggleSelect(row.id)}
                      />
                    </TableCell>
                  )}

                  {/* Date */}
                  <TableCell className="w-[110px] py-4 pl-4 align-top">
                    <div className="text-sm font-medium text-foreground tabular-nums whitespace-nowrap">
                      {fmtDate(row.date)}
                    </div>
                    {stale && (
                      <span className="flex items-center gap-0.5 text-[10px] text-amber mt-1">
                        <Clock className="h-2.5 w-2.5" />
                        Expiring
                      </span>
                    )}
                  </TableCell>

                  {/* Property */}
                  <TableCell className="min-w-[180px] py-4 align-top">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className="text-sm font-medium text-foreground leading-tight">{row.listingName}</div>
                      {hasMarketReasoning(row.reasoning) && (
                        <Badge className="h-4 border-cyan-500/25 bg-cyan-500/10 px-1.5 text-[9px] font-semibold uppercase tracking-wide text-cyan-300">
                          Market
                        </Badge>
                      )}
                    </div>
                    <ConstraintBadges row={row} />
                  </TableCell>

                  {/* Price */}
                  <TableCell className="w-[180px] py-4 align-top">
                    {activeTab === "pending" && row.proposedPrice ? (
                      <div className="space-y-0.5">
                        <div className="text-xs text-muted-foreground line-through">
                          {row.currencyCode || "AED"} {Number(row.currentPrice).toLocaleString("en-US")}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="text-sm font-bold text-foreground">
                            {row.currencyCode || "AED"} {Number(row.proposedPrice).toLocaleString("en-US")}
                          </div>
                          <OptimizedPriceInfo row={row} />
                        </div>
                        <DeltaBadge pct={row.changePct} />
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        <div className="text-sm font-bold text-foreground">
                          {row.currencyCode || "AED"} {Number(row.currentPrice).toLocaleString("en-US")}
                        </div>
                        <span className={cn(
                          "text-[10px] font-semibold",
                          activeTab === "approved" ? "text-green-400" :
                          activeTab === "rejected" ? "text-red-400" :
                          "text-blue-400"
                        )}>
                          {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
                        </span>
                      </div>
                    )}
                  </TableCell>

                  {/* Risk */}
                  <TableCell className="w-[80px] py-4 text-center align-top">
                    {activeTab === "pending" ? (
                      <RiskBadge pct={row.changePct} />
                    ) : (
                      <Badge
                        className={cn(
                          "text-[9px] border",
                          activeTab === "approved"
                            ? "bg-green-500/10 text-green-400 border-green-500/20"
                            : activeTab === "rejected"
                            ? "bg-red-500/10 text-red-400 border-red-500/20"
                            : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                        )}
                      >
                        {activeTab}
                      </Badge>
                    )}
                  </TableCell>

                  {/* Reasoning */}
                  <TableCell className="min-w-[200px] max-w-[340px] py-4 align-top">
                    <ReasoningCell reasoning={row.reasoning} />
                  </TableCell>

                  {/* Row Actions */}
                  {(activeTab === "pending" || activeTab === "approved" || activeTab === "rejected") && (
                    <TableCell className="py-4 text-right align-top pr-4">
                      {activeTab === "pending" && modifyingId === row.id ? (
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-[10px] text-muted-foreground">{row.currencyCode || "AED"}</span>
                          <Input
                            type="number"
                            value={modifyPrice}
                            onChange={(e) => setModifyPrice(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleModify(row.id);
                              if (e.key === "Escape") cancelModify();
                            }}
                            className="h-7 w-20 text-xs bg-background border-border/70 px-1.5 text-foreground dark:bg-white/[0.04] dark:border-white/15"
                            autoFocus
                          />
                          <Button
                            size="sm"
                            disabled={isSavingModify}
                            onClick={() => handleModify(row.id)}
                            className="h-7 px-2.5 text-xs bg-amber text-black hover:bg-amber/90"
                          >
                            {isSavingModify ? <RefreshCcw className="h-3 w-3 animate-spin" /> : "Save"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={cancelModify}
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : activeTab === "pending" ? (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSingleAction(row.id, "approve")}
                            className="h-7 px-2.5 text-xs text-green-500 hover:bg-green-500/10 hover:text-green-400 gap-1"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Approve
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openModify(row)}
                            className="h-7 px-2.5 text-xs text-amber/80 hover:bg-amber/10 hover:text-amber gap-1"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Modify
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSingleAction(row.id, "reject")}
                            className="h-7 px-2.5 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300 gap-1"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </Button>
                        </div>
                      ) : activeTab === "rejected" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSingleAction(row.id, "approve")}
                          className="h-7 px-2.5 text-xs text-green-500 hover:bg-green-500/10 hover:text-green-400 gap-1"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Approve
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          disabled={isProcessing}
                          onClick={() => handlePushAction([row.id])}
                          className="h-7 px-3 text-xs bg-blue-600 text-white hover:bg-blue-500 gap-1"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          Push
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            </TableBody>
          </Table>
          </div>

          {/* High-risk warning */}
          {activeTab === "pending" && displayProposals.filter((p) => riskLevel(p.changePct) === "high").length > 0 && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-500/5 border-t border-red-500/10">
              <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
              <p className="text-xs text-red-400">
                <strong>{displayProposals.filter((p) => riskLevel(p.changePct) === "high").length} high-risk proposals</strong> (&gt;15% change) - review individually before bulk approving.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Live Execution Graph Overlay */}
      {showLiveGraph && (
        <div className={cn(
          "fixed z-[100] transition-all duration-300 ease-in-out shadow-2xl border border-border/40 bg-card/95 backdrop-blur-md overflow-hidden flex flex-col",
          isGraphExpanded 
            ? "inset-8 rounded-2xl" 
            : "bottom-24 right-8 w-[420px] h-[520px] rounded-xl"
        )}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 shrink-0 bg-muted/30">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${isGraphConnected ? 'bg-emerald-500 animate-pulse' : 'bg-primary'}`} />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Engine Execution Graph
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 w-7 p-0 rounded-full hover:bg-muted" 
                onClick={() => setIsGraphExpanded(!isGraphExpanded)}
                title={isGraphExpanded ? "Shrink" : "Expand"}
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => {
                  setShowLiveGraph(false);
                  setIsGraphProcessing(false);
                }}
                className="h-7 w-7 p-0 rounded-full hover:bg-muted text-slate-400 hover:text-rose-500"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Graph Body */}
          <div className="flex-1 relative bg-black/20">
            {/* Live graph removed */}
          </div>
        </div>
      )}
    </div>
    </TooltipProvider>
  );
}

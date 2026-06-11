"use client";

import { useState, useMemo, useCallback } from "react";
import { format, subDays } from "date-fns";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartTooltip,
  ResponsiveContainer,
} from "recharts";
import {
  FlaskConical,
  Play,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { BacktestResult, BacktestDecision } from "@/lib/backtest/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHART_GRID_STROKE = "hsl(var(--border))";
const CHART_AXIS_STROKE = "hsl(var(--muted-foreground))";
const CHART_TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: "hsl(var(--background))",
  borderColor: "hsl(var(--border))",
  borderRadius: "12px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
};

const LISTING_OPTIONS = [
  { value: "all", label: "All Properties" },
  { value: "1001", label: "Marina Heights 1BR" },
  { value: "1002", label: "Downtown Residences 2BR" },
  { value: "1003", label: "JBR Beach Studio" },
  { value: "1004", label: "Palm Villa 3BR" },
  { value: "1005", label: "Bay View 1BR" },
];

type SortKey = keyof Pick<
  BacktestDecision,
  "date" | "listingName" | "proposedPrice" | "actualPrice" | "revenueImpact" | "errorPct"
>;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BacktestClient({ orgId }: { orgId: string | null }) {
  const today = format(new Date(), "yyyy-MM-dd");
  const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");

  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [listingId, setListingId] = useState("all");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Table sorting
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const runBacktest = useCallback(async () => {
    if (!orgId) {
      setError("No organisation ID available. Please log in.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/backtest/replay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId,
          listingId: listingId === "all" ? undefined : listingId,
          dateFrom,
          dateTo,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }

      const data: BacktestResult = await res.json();
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [orgId, listingId, dateFrom, dateTo]);

  // Sorted decisions
  const sortedDecisions = useMemo(() => {
    if (!result) return [];
    const list = [...result.decisions];
    list.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc"
          ? av.localeCompare(bv)
          : bv.localeCompare(av);
      }
      const na = Number(av);
      const nb = Number(bv);
      return sortDir === "asc" ? na - nb : nb - na;
    });
    return list;
  }, [result, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === "asc" ? (
      <ChevronUp className="inline h-3 w-3 ml-0.5" />
    ) : (
      <ChevronDown className="inline h-3 w-3 ml-0.5" />
    );
  };

  return (
    <div className="space-y-6">
      {/* ── Controls bar ─────────────────────────────────────── */}
      <Card className="border-border-default bg-surface-1">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary">
                From
              </label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-40 bg-surface-2 border-border-subtle text-text-primary"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary">
                To
              </label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-40 bg-surface-2 border-border-subtle text-text-primary"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary">
                Property
              </label>
              <Select value={listingId} onValueChange={setListingId}>
                <SelectTrigger className="w-52 bg-surface-2 border-border-subtle text-text-primary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LISTING_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={runBacktest}
              disabled={loading}
              className="bg-amber text-black hover:bg-amber/90 h-9"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <Play className="h-4 w-4 mr-1.5" />
              )}
              {loading ? "Running..." : "Run Backtest"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Error ────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* ── Loading skeleton ─────────────────────────────────── */}
      {loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="border-border-default bg-surface-1">
                <CardContent className="pt-6 space-y-3">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-8 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="border-border-default bg-surface-1">
            <CardContent className="pt-6">
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────── */}
      {!loading && !result && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FlaskConical className="h-12 w-12 text-text-tertiary mb-4" />
          <p className="text-text-secondary font-medium">
            No backtest results yet
          </p>
          <p className="text-sm text-text-tertiary mt-1 max-w-md">
            Select a date range and property above, then click &quot;Run
            Backtest&quot; to replay pricing decisions against actual outcomes.
          </p>
        </div>
      )}

      {/* ── Results ──────────────────────────────────────────── */}
      {result && !loading && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Total Decisions"
              value={result.totalDecisions.toLocaleString("en-US")}
              accent="blue"
            />
            <KpiCard
              label="Accuracy"
              value={`${result.accuracyPct.toLocaleString("en-US")}%`}
              accent="emerald"
            />
            <KpiCard
              label="Revenue Impact"
              value={`AED ${result.revenueImpactTotal.toLocaleString("en-US")}`}
              accent={result.revenueImpactTotal >= 0 ? "emerald" : "red"}
              delta={result.revenueImpactPct}
            />
            <KpiCard
              label="Mean Abs. Error"
              value={`${result.meanAbsoluteError.toLocaleString("en-US")}%`}
              accent="amber"
            />
          </div>

          {/* Accuracy over time chart */}
          <Card className="border-border-default bg-surface-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-text-primary">
                Accuracy Over Time
              </CardTitle>
              <p className="text-[11px] text-text-tertiary">
                Daily pricing accuracy (within 10% of actual = correct)
              </p>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={result.dailyAccuracy}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={CHART_GRID_STROKE}
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: CHART_AXIS_STROKE }}
                      tickFormatter={(v: string) => {
                        const d = new Date(`${v}T00:00:00`);
                        return format(d, "MMM d");
                      }}
                      stroke={CHART_GRID_STROKE}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 11, fill: CHART_AXIS_STROKE }}
                      tickFormatter={(v: number) => `${v}%`}
                      stroke={CHART_GRID_STROKE}
                    />
                    <RechartTooltip
                      contentStyle={CHART_TOOLTIP_STYLE}
                      labelFormatter={(label: string) => {
                        const d = new Date(`${label}T00:00:00`);
                        return format(d, "MMM d, yyyy");
                      }}
                      formatter={(value: number) => [
                        `${value.toLocaleString("en-US")}%`,
                        "Accuracy",
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="accuracy"
                      stroke="hsl(var(--chart-1, 220 70% 50%))"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Risk Breakdown (confusion-matrix style) */}
          <Card className="border-border-default bg-surface-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-text-primary">
                Risk Level Breakdown
              </CardTitle>
              <p className="text-[11px] text-text-tertiary">
                Accuracy by predicted risk level
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                {(
                  ["low", "medium", "high"] as Array<"low" | "medium" | "high">
                ).map((level) => {
                  const bucket = result.riskBreakdown[level];
                  return (
                    <div
                      key={level}
                      className="rounded-lg border border-border-subtle bg-surface-2/50 p-4 text-center"
                    >
                      <Badge
                        className={cn(
                          "text-[10px] border-none h-5 mb-3",
                          level === "low"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : level === "medium"
                              ? "bg-amber-500/15 text-amber-400"
                              : "bg-red-500/15 text-red-400"
                        )}
                      >
                        {level} risk
                      </Badge>
                      <p className="text-2xl font-bold text-text-primary">
                        {bucket.pct.toLocaleString("en-US")}%
                      </p>
                      <p className="text-[11px] text-text-tertiary mt-1">
                        {bucket.correct.toLocaleString("en-US")} /{" "}
                        {bucket.total.toLocaleString("en-US")} correct
                      </p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Decision table */}
          <Card className="border-border-default bg-surface-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-text-primary">
                Decision Details
              </CardTitle>
              <p className="text-[11px] text-text-tertiary">
                {result.totalDecisions.toLocaleString("en-US")} decisions
                {result.metadata.source === "mock" && " (demo data)"}
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[480px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-surface-1 z-10">
                    <TableRow className="border-border-subtle">
                      <TableHead>
                        <button
                          onClick={() => toggleSort("date")}
                          className="inline-flex items-center text-xs font-medium text-text-secondary hover:text-text-primary"
                        >
                          Date
                          <SortIcon col="date" />
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          onClick={() => toggleSort("listingName")}
                          className="inline-flex items-center text-xs font-medium text-text-secondary hover:text-text-primary"
                        >
                          Property
                          <SortIcon col="listingName" />
                        </button>
                      </TableHead>
                      <TableHead className="text-right">
                        <button
                          onClick={() => toggleSort("proposedPrice")}
                          className="inline-flex items-center text-xs font-medium text-text-secondary hover:text-text-primary"
                        >
                          Proposed
                          <SortIcon col="proposedPrice" />
                        </button>
                      </TableHead>
                      <TableHead className="text-right">
                        <button
                          onClick={() => toggleSort("actualPrice")}
                          className="inline-flex items-center text-xs font-medium text-text-secondary hover:text-text-primary"
                        >
                          Actual
                          <SortIcon col="actualPrice" />
                        </button>
                      </TableHead>
                      <TableHead className="text-center">Booked</TableHead>
                      <TableHead className="text-right">
                        <button
                          onClick={() => toggleSort("revenueImpact")}
                          className="inline-flex items-center text-xs font-medium text-text-secondary hover:text-text-primary"
                        >
                          Rev. Delta
                          <SortIcon col="revenueImpact" />
                        </button>
                      </TableHead>
                      <TableHead className="text-right">
                        <button
                          onClick={() => toggleSort("errorPct")}
                          className="inline-flex items-center text-xs font-medium text-text-secondary hover:text-text-primary"
                        >
                          Error %
                          <SortIcon col="errorPct" />
                        </button>
                      </TableHead>
                      <TableHead className="text-center">Risk</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedDecisions.map((d, i) => (
                      <TableRow
                        key={`${d.date}-${d.listingId}-${i}`}
                        className={cn(
                          "border-border-subtle",
                          d.revenueImpact > 0
                            ? "bg-emerald-500/[0.03]"
                            : d.revenueImpact < 0
                              ? "bg-red-500/[0.03]"
                              : ""
                        )}
                      >
                        <TableCell className="text-xs text-text-secondary">
                          {format(
                            new Date(`${d.date}T00:00:00`),
                            "MMM d, yyyy"
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-text-primary font-medium">
                          {d.listingName}
                        </TableCell>
                        <TableCell className="text-xs text-text-secondary text-right tabular-nums">
                          AED{" "}
                          {d.proposedPrice.toLocaleString("en-US")}
                        </TableCell>
                        <TableCell className="text-xs text-text-secondary text-right tabular-nums">
                          AED{" "}
                          {d.actualPrice.toLocaleString("en-US")}
                        </TableCell>
                        <TableCell className="text-center">
                          <span
                            className={cn(
                              "inline-block h-2 w-2 rounded-full",
                              d.wasBooked
                                ? "bg-emerald-400"
                                : "bg-text-tertiary"
                            )}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={cn(
                              "inline-flex items-center gap-0.5 text-xs tabular-nums font-medium",
                              d.revenueImpact > 0
                                ? "text-emerald-400"
                                : d.revenueImpact < 0
                                  ? "text-red-400"
                                  : "text-text-tertiary"
                            )}
                          >
                            {d.revenueImpact > 0 && (
                              <ArrowUpRight className="h-3 w-3" />
                            )}
                            {d.revenueImpact < 0 && (
                              <ArrowDownRight className="h-3 w-3" />
                            )}
                            {d.revenueImpact !== 0
                              ? `AED ${Math.abs(d.revenueImpact).toLocaleString("en-US")}`
                              : "--"}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-text-secondary text-right tabular-nums">
                          {d.errorPct.toLocaleString("en-US")}%
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            className={cn(
                              "text-[10px] border-none h-5",
                              d.riskLevel === "low"
                                ? "bg-emerald-500/15 text-emerald-400"
                                : d.riskLevel === "medium"
                                  ? "bg-amber-500/15 text-amber-400"
                                  : "bg-red-500/15 text-red-400"
                            )}
                          >
                            {d.riskLevel}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Metadata footer */}
          <p className="text-[11px] text-text-tertiary text-right">
            Run at{" "}
            {format(new Date(result.metadata.runAt), "MMM d, yyyy HH:mm:ss")}
            {result.metadata.source === "mock" && " -- demo data"}
          </p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI Card sub-component
// ---------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  accent,
  delta,
}: {
  label: string;
  value: string;
  accent: "blue" | "emerald" | "amber" | "red";
  delta?: number;
}) {
  const gradients: Record<string, string> = {
    blue: "from-blue-500/20 to-blue-600/5",
    emerald: "from-emerald-500/20 to-emerald-600/5",
    amber: "from-amber-500/20 to-amber-600/5",
    red: "from-red-500/20 to-red-600/5",
  };

  const textColors: Record<string, string> = {
    blue: "text-blue-400",
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    red: "text-red-400",
  };

  return (
    <Card className="border-border-default bg-surface-1 overflow-hidden">
      <div
        className={cn(
          "h-px w-full bg-gradient-to-r",
          gradients[accent]
        )}
      />
      <CardContent className="pt-5 pb-4">
        <p className="text-[11px] uppercase tracking-wider font-medium text-text-tertiary">
          {label}
        </p>
        <p
          className={cn(
            "text-2xl font-bold mt-1 tracking-tight",
            textColors[accent]
          )}
        >
          {value}
        </p>
        {delta !== undefined && (
          <p
            className={cn(
              "text-xs mt-1 inline-flex items-center gap-0.5",
              delta >= 0 ? "text-emerald-400" : "text-red-400"
            )}
          >
            {delta >= 0 ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {Math.abs(delta).toLocaleString("en-US")}%
          </p>
        )}
      </CardContent>
    </Card>
  );
}

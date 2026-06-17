"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Globe,
  Loader2,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
} from "lucide-react";
import { useContextStore } from "@/stores/context-store";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

// ---------------------------------------------------------------------------
// Types (mirrors DemandModifierResult from lib/demand/modifiers)
// ---------------------------------------------------------------------------

interface BreakdownEntry {
  marketId: string;
  marketName: string;
  weight: number;
  signal: string;
  contribution: number;
}

interface ModifierResponse {
  compositeDemandIndex: number;
  priceModifierPct: number;
  dominantMarket: string;
  activeSignals: Array<{
    sourceMarketId: string;
    signal: string;
    magnitude: number;
    reason?: string;
    confidence: number;
  }>;
  breakdown: BreakdownEntry[];
  marketTemplate: string;
  month: number;
  source: string;
}

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

const SIGNAL_COLORS: Record<string, string> = {
  surge: "#10b981",    // emerald-500
  normal: "#3b82f6",   // blue-500
  weak: "#2d7ff9",     // amber-500
  disrupted: "#ef4444", // red-500
};

function signalColor(signal: string): string {
  return SIGNAL_COLORS[signal] ?? SIGNAL_COLORS.normal;
}

function demandIndexColor(index: number): string {
  if (index >= 115) return "#10b981";  // strong
  if (index >= 100) return "#3b82f6";  // normal-good
  if (index >= 85) return "#2d7ff9";   // caution
  return "#ef4444";                    // weak
}

function priceModLabel(pct: number): string {
  if (pct > 0) return `+${pct.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
  if (pct < 0) return `${pct.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
  return "0%";
}

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ---------------------------------------------------------------------------
// Custom Tooltip
// ---------------------------------------------------------------------------

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: BreakdownEntry }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-background border border-border/60 rounded-lg px-3 py-2 shadow-md text-[10px]">
      <p className="font-bold text-foreground">{d.marketName}</p>
      <p className="text-muted-foreground mt-0.5">
        Weight: {d.weight.toLocaleString("en-US")}% | Signal:{" "}
        <span style={{ color: signalColor(d.signal) }} className="font-bold uppercase">
          {d.signal}
        </span>
      </p>
      <p className="text-muted-foreground">
        Contribution: {d.contribution.toLocaleString("en-US")}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

interface SourceMarketWidgetProps {
  /** Destination market key, e.g. "dubai" */
  marketTemplate?: string;
  /** Target month 1-12. Defaults to current month. */
  month?: number;
}

export function SourceMarketWidget({
  marketTemplate = "dubai",
  month,
}: SourceMarketWidgetProps) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ModifierResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const { isMarketAnalysisRunning } = useContextStore();

  const targetMonth = month ?? new Date().getMonth() + 1;

  const fetchModifiers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        marketTemplate,
        month: String(targetMonth),
      });
      const res = await fetch(`/api/demand/modifiers?${params}`);
      if (res.ok) {
        const json: ModifierResponse = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error("SourceMarketWidget fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [marketTemplate, targetMonth]);

  useEffect(() => {
    fetchModifiers();
  }, [fetchModifiers]);

  const isPending = loading || isMarketAnalysisRunning;

  // Prepare chart data - sorted by contribution descending
  const chartData = useMemo(() => {
    if (!data) return [];
    return data.breakdown.map((b) => ({
      ...b,
      // Short label for the X axis
      label: b.marketName.length > 12 ? b.marketId.toUpperCase() : b.marketName,
    }));
  }, [data]);

  // Highlighted signals (surge or disrupted)
  const highlightedSignals = useMemo(() => {
    if (!data) return [];
    return data.activeSignals.filter(
      (s) => s.signal === "surge" || s.signal === "disrupted",
    );
  }, [data]);

  // Find dominant market name
  const dominantName = useMemo(() => {
    if (!data) return "";
    const entry = data.breakdown.find((b) => b.marketId === data.dominantMarket);
    return entry?.marketName ?? data.dominantMarket;
  }, [data]);

  if (!data && !isPending) return null;

  return (
    <div className="border border-border/50 rounded-xl overflow-hidden bg-background text-foreground shadow-sm mb-3">
      {/* Header */}
      <div
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer border-b border-border/30"
      >
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-indigo-500" />
          <span className="text-[11px] font-black uppercase tracking-widest">
            Source Markets
          </span>
          {data && (
            <span className="text-[9px] text-muted-foreground font-medium ml-1">
              {MONTH_NAMES[data.month] ?? ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isPending && data && (
            <span
              className="px-2 py-0.5 rounded-full text-[9px] font-bold border"
              style={{
                color: demandIndexColor(data.compositeDemandIndex),
                background: `${demandIndexColor(data.compositeDemandIndex)}15`,
                borderColor: `${demandIndexColor(data.compositeDemandIndex)}40`,
              }}
            >
              Index {data.compositeDemandIndex.toLocaleString("en-US")}
            </span>
          )}
          {!isPending && data && (
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-muted/50 text-muted-foreground border border-border/40">
              {data.source === "live" ? "Live" : "Seasonal"}
            </span>
          )}
          {open ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </div>

      {open && (
        <div className="p-3 space-y-3">
          {/* About section */}
          <div className="p-2 bg-muted/20 border border-border/40 rounded-lg text-[9px] text-muted-foreground leading-relaxed">
            <strong className="text-foreground">About this data:</strong> Demand
            contributions from tourist source markets weighted by seasonal
            patterns, booking behavior, and live signals when available.
            <ul className="mt-1 space-y-0.5 list-disc pl-3">
              <li>
                <strong className="text-foreground">Index:</strong> Composite
                demand score where 100 = baseline. Higher = more demand.
              </li>
              <li>
                <strong className="text-foreground">Price Mod:</strong> Suggested
                price adjustment driven by demand shifts and price elasticity.
              </li>
              <li>
                <strong className="text-foreground">Bars:</strong> Each source
                market's weighted contribution to the composite index.
              </li>
            </ul>
          </div>

          {isPending ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
            </div>
          ) : data ? (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-muted/20 rounded-lg p-2 border border-border/30 text-center">
                  <span className="text-[8px] font-black uppercase text-muted-foreground tracking-wider">
                    Demand Index
                  </span>
                  <p
                    className="text-[14px] font-black mt-0.5"
                    style={{ color: demandIndexColor(data.compositeDemandIndex) }}
                  >
                    {data.compositeDemandIndex.toLocaleString("en-US")}
                  </p>
                </div>
                <div className="bg-muted/20 rounded-lg p-2 border border-border/30 text-center">
                  <span className="text-[8px] font-black uppercase text-muted-foreground tracking-wider">
                    Price Modifier
                  </span>
                  <p className="text-[14px] font-black mt-0.5 flex items-center justify-center gap-1">
                    {data.priceModifierPct > 0 ? (
                      <TrendingUp className="h-3 w-3 text-emerald-500" />
                    ) : data.priceModifierPct < 0 ? (
                      <TrendingDown className="h-3 w-3 text-rose-500" />
                    ) : null}
                    <span
                      className={
                        data.priceModifierPct > 0
                          ? "text-emerald-500"
                          : data.priceModifierPct < 0
                            ? "text-rose-500"
                            : "text-foreground"
                      }
                    >
                      {priceModLabel(data.priceModifierPct)}
                    </span>
                  </p>
                </div>
                <div className="bg-muted/20 rounded-lg p-2 border border-border/30 text-center">
                  <span className="text-[8px] font-black uppercase text-muted-foreground tracking-wider">
                    Dominant Market
                  </span>
                  <p className="text-[11px] font-black mt-1 truncate" title={dominantName}>
                    {dominantName}
                  </p>
                </div>
              </div>

              {/* Bar chart */}
              {chartData.length > 0 && (
                <div className="bg-muted/10 rounded-lg border border-border/30 p-2">
                  <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground px-1 mb-1 block">
                    Demand Contribution by Market
                  </span>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart
                      data={chartData}
                      margin={{ top: 4, right: 4, bottom: 4, left: -20 }}
                    >
                      <CartesianGrid
                        vertical={false}
                        strokeDasharray="3 3"
                        opacity={0.2}
                      />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 9, fill: "currentColor" }}
                        interval={0}
                        angle={-35}
                        textAnchor="end"
                        height={45}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 9, fill: "currentColor" }}
                        tickFormatter={(v: number) =>
                          v.toLocaleString("en-US", { maximumFractionDigits: 0 })
                        }
                      />
                      <Tooltip
                        content={<CustomTooltip />}
                        cursor={{ fill: "currentColor", opacity: 0.05 }}
                      />
                      <Bar dataKey="contribution" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry) => (
                          <Cell
                            key={entry.marketId}
                            fill={signalColor(entry.signal)}
                            fillOpacity={0.75}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Active alerts (surge / disrupted) */}
              {highlightedSignals.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground px-1">
                    Active Signals
                  </span>
                  {highlightedSignals.map((s) => {
                    const isSurge = s.signal === "surge";
                    return (
                      <div
                        key={s.sourceMarketId}
                        className="flex items-start gap-2 p-2 rounded-lg border"
                        style={{
                          background: isSurge ? "#10b98110" : "#ef444410",
                          borderColor: isSurge ? "#10b98130" : "#ef444430",
                        }}
                      >
                        {isSurge ? (
                          <TrendingUp className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                        )}
                        <div className="flex flex-col min-w-0">
                          <span
                            className="text-[10px] font-bold uppercase"
                            style={{ color: isSurge ? "#10b981" : "#ef4444" }}
                          >
                            {s.signal} -- {s.sourceMarketId.toUpperCase()}
                          </span>
                          {s.reason && (
                            <span className="text-[9px] text-muted-foreground mt-0.5 leading-relaxed">
                              {s.reason}
                            </span>
                          )}
                          <span className="text-[8px] text-muted-foreground/60 mt-0.5">
                            Magnitude: {s.magnitude.toLocaleString("en-US")}x | Confidence:{" "}
                            {Math.round(s.confidence * 100).toLocaleString("en-US")}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Per-market breakdown table */}
              <div className="space-y-1">
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground px-1">
                  Market Breakdown
                </span>
                <div className="space-y-1 max-h-[200px] overflow-y-auto pr-1">
                  {data.breakdown.map((b) => (
                    <div
                      key={b.marketId}
                      className="flex items-center justify-between p-2 rounded-lg bg-muted/10 border border-border/30"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] font-bold truncate">
                          {b.marketName}
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded border"
                            style={{
                              color: signalColor(b.signal),
                              background: `${signalColor(b.signal)}15`,
                              borderColor: `${signalColor(b.signal)}30`,
                            }}
                          >
                            {b.signal}
                          </span>
                          <span className="text-[8px] text-muted-foreground">
                            Weight: {b.weight.toLocaleString("en-US")}%
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end shrink-0">
                        <span className="text-[12px] font-black" style={{ color: signalColor(b.signal) }}>
                          {b.contribution.toLocaleString("en-US")}
                        </span>
                        <span className="text-[8px] text-muted-foreground uppercase">
                          contribution
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

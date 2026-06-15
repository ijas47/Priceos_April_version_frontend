"use client";

import { useEffect, useState, useCallback } from "react";
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus, ExternalLink, BarChart3, RefreshCw, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useContextStore } from "@/stores/context-store";
import { cn } from "@/lib/utils";

interface BenchmarkSummary {
    id: number;
    listingId: number;
    dateFrom: string;
    dateTo: string;
    p25Rate: string | null;
    p50Rate: string | null;
    p75Rate: string | null;
    p90Rate: string | null;
    avgWeekday: string | null;
    avgWeekend: string | null;
    yourPrice: string | null;
    percentile: number | null;
    verdict: string | null;
    rateTrend: string | null;
    trendPct: string | null;
    recommendedWeekday: string | null;
    recommendedWeekend: string | null;
    recommendedEvent: string | null;
    reasoning: string | null;
    source?: string;
}

interface BenchmarkComp {
    name: string;
    source: string;
    sourceUrl?: string | null;
    rating?: number | null;
    reviews?: number | null;
    avgRate: number;
    weekdayRate?: number | null;
    weekendRate?: number | null;
    minRate?: number | null;
    maxRate?: number | null;
}

interface BenchmarkWidgetProps {
    listingId: string | null;
    dateFrom: string | null;
    dateTo: string | null;
    refreshKey?: number;
    currency?: string;
}

const verdictConfig: Record<string, { label: string; color: string; bg: string; border: string }> = {
    UNDERPRICED: { label: "Underpriced", color: "#10b981", bg: "#ecfdf5", border: "#a7f3d0" },
    FAIR: { label: "Fair", color: "#3b82f6", bg: "#eff6ff", border: "#bfdbfe" },
    SLIGHTLY_ABOVE: { label: "Slightly Above", color: "#2d7ff9", bg: "#fffbeb", border: "#fde68a" },
    OVERPRICED: { label: "Overpriced", color: "#ef4444", bg: "#fef2f2", border: "#fecaca" },
};

function TrendIcon({ trend }: { trend: string | null }) {
    if (trend === "rising") return <TrendingUp className="h-3 w-3 text-emerald-500" />;
    if (trend === "falling") return <TrendingDown className="h-3 w-3 text-rose-500" />;
    return <Minus className="h-3 w-3 text-muted-foreground" />;
}

function CurrencyVal({ val, currency }: { val: string | null; currency: string }) {
    if (!val) return <span className="text-muted-foreground/40">—</span>;
    return <span className="font-bold">{currency} {Number(val).toFixed(0)}</span>;
}

export function BenchmarkWidget({ listingId, dateFrom, dateTo, refreshKey = 0, currency = "AED" }: BenchmarkWidgetProps) {
    const [open, setOpen] = useState(true);
    const [compsOpen, setCompsOpen] = useState(false);
    const [summary, setSummary] = useState<BenchmarkSummary | null>(null);
    const [comps, setComps] = useState<BenchmarkComp[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasData, setHasData] = useState(false);
    const { triggerMarketRefresh, isMarketAnalysisRunning } = useContextStore();

    const fetchBenchmark = useCallback(async () => {
        if (!listingId) return;
        setLoading(true);
        try {
            const params = new URLSearchParams({ listingId: String(listingId) });
            if (dateFrom) params.set("dateFrom", dateFrom);
            if (dateTo) params.set("dateTo", dateTo);
            const res = await fetch(`/api/benchmark?${params}`);
            const json = await res.json();
            if (json.success) {
                setHasData(json.hasData);
                setSummary(json.summary);
                setComps(json.comps ?? []);
            }
        } catch (e) {
            console.error("BenchmarkWidget fetch error:", e);
        } finally {
            setLoading(false);
        }
    }, [listingId, dateFrom, dateTo, refreshKey]);

    useEffect(() => {
        fetchBenchmark();
    }, [fetchBenchmark]);

    const vc = summary?.verdict ? verdictConfig[summary.verdict] ?? verdictConfig.FAIR : null;
    // aedGap: derived in JS — no longer stored in DB
    const aedGapNum = (summary?.yourPrice && summary?.p50Rate)
        ? Number(summary.yourPrice) - Number(summary.p50Rate)
        : null;

    const isPending = loading || isMarketAnalysisRunning;

    return (
        <div className="border border-border/50 rounded-xl overflow-hidden bg-background text-foreground shadow-sm">
            {/* Header */}
            <div
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
            >
                <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-[#f39c12]" />
                    <span className="text-[11px] font-black uppercase tracking-widest">Benchmark Intelligence</span>
                </div>
                <div className="flex items-center gap-2">
                    {hasData && !isPending && summary?.source && (
                        <span className={cn(
                            "px-2 py-0.5 rounded-full text-[9px] font-bold border",
                            summary.source === 'cache' ? "bg-blue-500/10 text-blue-500 border-blue-500/30" :
                            summary.source === 'internet_fallback' ? "bg-primary/10 text-primary border-primary/30" :
                            "bg-slate-500/10 text-slate-500 border-slate-500/30"
                        )}>
                            {summary.source === 'cache' ? 'Airbtics API' : summary.source === 'internet_fallback' ? 'Agent 7 Research' : 'Historical DB'}
                        </span>
                    )}
                    {hasData && !isPending && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#f39c12]/10 text-[#f39c12] border border-[#f39c12]/30">
                            {comps.length} comps
                        </span>
                    )}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            triggerMarketRefresh();
                        }}
                        className="p-1 rounded-full hover:bg-muted text-muted-foreground transition-colors"
                        title="Refresh from database"
                    >
                        <RefreshCw className={`h-3 w-3 ${isPending ? "animate-spin" : ""}`} />
                    </button>
                    {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                </div>
            </div>

            {open && (
                <div className="p-3 space-y-3 animate-in slide-in-from-top-1 duration-200">
                    {isPending && (
                        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-3">
                            <div className="relative">
                                <BarChart3 className="h-10 w-10 text-[#f39c12]/20" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Loader2 className="h-5 w-5 animate-spin text-[#f39c12]" />
                                </div>
                            </div>
                            <div className="text-center">
                                <p className="text-[10px] font-black uppercase tracking-widest text-[#f39c12]">
                                    {isMarketAnalysisRunning ? "Running Live Analysis..." : "Fetching Intelligence..."}
                                </p>
                                <p className="text-[9px] opacity-60 mt-1 italic">
                                    {isMarketAnalysisRunning ? "Analyzing competitor rates & market position" : "Connecting to database"}
                                </p>
                            </div>
                        </div>
                    )}

                    {!isPending && !hasData && (
                        <div className="text-center py-8 text-muted-foreground">
                            <div className="h-14 w-14 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-3">
                                <BarChart3 className="h-7 w-7 opacity-20" />
                            </div>
                            <p className="text-[11px] font-black uppercase tracking-widest text-foreground/70">No benchmark data yet</p>
                            <p className="text-[10px] opacity-60 mt-1 max-w-[200px] mx-auto leading-relaxed">
                                <strong className="text-foreground">Ask Aria</strong> a question to populate competitor rates and positioning insights
                            </p>
                        </div>
                    )}

                    {!isPending && hasData && summary && (
                        <>
                            {/* Verdict pill */}
                            {vc && (
                                <div
                                    className="flex items-center justify-between px-3 py-2 rounded-lg border"
                                    style={{ background: vc.bg, borderColor: vc.border }}
                                >
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-black uppercase tracking-widest opacity-60">Market Position</span>
                                        <span className="text-[13px] font-black mt-0.5" style={{ color: vc.color }}>{vc.label}</span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-[9px] font-black uppercase tracking-widest opacity-60">Percentile</span>
                                        <span className="text-[18px] font-black leading-tight" style={{ color: vc.color }}>
                                            {summary.percentile ?? "—"}
                                            <span className="text-[10px]">th</span>
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Currency gap */}
                            {aedGapNum !== null && (
                                <div className="flex items-center gap-1.5 text-[11px] px-1">
                                    <TrendIcon trend={aedGapNum > 0 ? "rising" : aedGapNum < 0 ? "falling" : null} />
                                    <span className="text-muted-foreground">vs market median:</span>
                                    <span className={`font-bold ${aedGapNum > 0 ? "text-primary" : aedGapNum < 0 ? "text-emerald-500" : "text-foreground"}`}>
                                        {aedGapNum > 0 ? "+" : ""}{aedGapNum.toFixed(0)} {currency}
                                    </span>
                                </div>
                            )}

                            {/* Rate Distribution */}
                            <div className="bg-muted/20 rounded-lg p-2.5 space-y-1.5 border border-border/30">
                                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Rate Distribution</span>
                                <div className="grid grid-cols-4 gap-1 mt-1">
                                    {[
                                        { label: "P25", val: summary.p25Rate },
                                        { label: "P50", val: summary.p50Rate },
                                        { label: "P75", val: summary.p75Rate },
                                        { label: "P90", val: summary.p90Rate },
                                    ].map(({ label, val }) => (
                                        <div key={label} className="flex flex-col items-center bg-background rounded-md py-1.5 px-1 border border-border/40">
                                            <span className="text-[8px] font-black text-muted-foreground uppercase">{label}</span>
                                            <span className="text-[11px] font-bold text-foreground mt-0.5">{val ? Number(val).toFixed(0) : "—"}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Weekday / Weekend avg */}
                            <div className="grid grid-cols-2 gap-2">
                                <div className="bg-muted/20 rounded-lg p-2 border border-border/30 text-center">
                                    <span className="text-[8px] font-black uppercase text-muted-foreground tracking-wider">Avg Weekday</span>
                                    <p className="text-[13px] font-black mt-0.5"><CurrencyVal val={summary.avgWeekday} currency={currency} /></p>
                                </div>
                                <div className="bg-muted/20 rounded-lg p-2 border border-border/30 text-center">
                                    <span className="text-[8px] font-black uppercase text-muted-foreground tracking-wider">Avg Weekend</span>
                                    <p className="text-[13px] font-black mt-0.5"><CurrencyVal val={summary.avgWeekend} currency={currency} /></p>
                                </div>
                            </div>

                            {/* Recommended rates */}
                            <div className="space-y-1">
                                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground px-1">Recommended Rates</span>
                                <div className="bg-[#f39c12]/5 rounded-lg border border-[#f39c12]/20 p-2.5 space-y-1.5">
                                    {[
                                        { label: "Weekday", val: summary.recommendedWeekday },
                                        { label: "Weekend", val: summary.recommendedWeekend },
                                        { label: "Event Night", val: summary.recommendedEvent },
                                    ].map(({ label, val }) => (
                                        <div key={label} className="flex items-center justify-between text-[11px]">
                                            <span className="text-muted-foreground font-medium">{label}</span>
                                            <CurrencyVal val={val} currency={currency} />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Rate trend */}
                            {summary.rateTrend && (
                                <div className="flex items-center gap-1.5 px-1 text-[11px]">
                                    <TrendIcon trend={summary.rateTrend} />
                                    <span className="text-muted-foreground capitalize">
                                        Market rates are <strong>{summary.rateTrend}</strong>
                                        {summary.trendPct ? ` (${Number(summary.trendPct) > 0 ? "+" : ""}${Number(summary.trendPct).toFixed(1)}%)` : ""}
                                    </span>
                                </div>
                            )}

                            {/* Comps collapse */}
                            {comps.length > 0 && (
                                <div className="border border-border/40 rounded-lg overflow-hidden">
                                    <button
                                        onClick={() => setCompsOpen(o => !o)}
                                        className="w-full flex items-center justify-between px-3 py-2 bg-muted/20 hover:bg-muted/40 transition-colors text-[10px] font-black uppercase tracking-widest"
                                    >
                                        <span>Comparable Properties ({comps.length})</span>
                                        {compsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                    </button>

                                    {compsOpen && (
                                        <div className="divide-y divide-border/30 animate-in slide-in-from-top-1 duration-150">
                                            {comps.map((comp, idx) => (
                                                <a
                                                    key={idx}
                                                    href={comp.sourceUrl ?? "#"}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={cn(
                                                        "group/comp px-3 py-2.5 flex items-start justify-between gap-2 hover:bg-muted/30 transition-all relative block",
                                                        !comp.sourceUrl && "pointer-events-none opacity-80"
                                                    )}
                                                >
                                                    <div className="flex flex-col min-w-0">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[11px] font-bold truncate max-w-[140px] group-hover/comp:text-[#f39c12] transition-colors flex items-center gap-1">
                                                                {comp.name ?? "Unnamed Listing"}
                                                                {comp.sourceUrl && <ExternalLink className="h-2 w-2 opacity-0 group-hover/comp:opacity-100 transition-all translate-x-1" />}
                                                            </span>
                                                        </div>
                                                        <div className="flex flex-col gap-1 mt-0.5">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className={cn(
                                                                    "text-[9px] px-1.5 py-0.5 rounded font-semibold border transition-colors",
                                                                    comp.source === "Airbnb" ? "bg-rose-500/10 text-rose-600 border-rose-500/20" :
                                                                        comp.source === "Booking.com" ? "bg-blue-500/10 text-blue-600 border-blue-500/20" :
                                                                            "bg-primary/10 text-primary border-primary/20"
                                                                )}>
                                                                    {comp.source ?? "OTA"}
                                                                </span>

                                                                {comp.rating && (
                                                                    <span className="text-[9px] text-primary font-bold">★ {comp.rating}</span>
                                                                )}
                                                                {comp.reviews != null && (
                                                                    <span className="text-[9px] text-muted-foreground">{comp.reviews} reviews</span>
                                                                )}

                                                                {comp.sourceUrl && (
                                                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-bold border border-emerald-500/20 flex items-center gap-1 ml-1 scale-90 origin-left">
                                                                        Verified
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col items-end shrink-0">
                                                        <span className="text-[12px] font-black text-[#f39c12]">
                                                            {comp.avgRate ? `${currency} ${Math.round(Number(comp.avgRate))}` : "—"}
                                                        </span>
                                                        <span className="text-[8px] text-muted-foreground uppercase font-medium">avg/night</span>
                                                    </div>
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Reasoning */}
                            {summary.reasoning && (
                                <p className="text-[10px] text-muted-foreground leading-relaxed px-1 border-t border-border/30 pt-2">
                                    💡 {summary.reasoning}
                                </p>
                            )}

                            {/* Date scope */}
                            <p className="text-[9px] text-muted-foreground/50 text-right px-1">
                                {summary.dateFrom && summary.dateTo
                                    ? `${format(new Date(summary.dateFrom), "MMM d")} – ${format(new Date(summary.dateTo), "MMM d, yyyy")} · ${comps.length} comps`
                                    : ""}
                            </p>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

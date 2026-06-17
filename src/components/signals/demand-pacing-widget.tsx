"use client";

import { useEffect, useState, useCallback } from "react";
import { Activity, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { useContextStore } from "@/stores/context-store";
import { format } from "date-fns";

interface PacingDay {
    date: string;
    demandScore: number | null;
    avgPrice: number | null;
    pacing: number | null;
    demandTier: string;
    dayOfWeek: string;
    isWeekend: boolean;
}

export function DemandPacingWidget({ dateFrom, dateTo, marketId = "2286", currency = "AED" }: { dateFrom: string | null, dateTo: string | null, marketId?: string, currency?: string }) {
    const [open, setOpen] = useState(false);
    const [pacing, setPacing] = useState<PacingDay[]>([]);
    const [loading, setLoading] = useState(false);
    const { isMarketAnalysisRunning } = useContextStore();

    const fetchPacing = useCallback(async () => {
        if (!dateFrom || !dateTo) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/agent-tools/demand-pacing?dateFrom=${dateFrom}&dateTo=${dateTo}&marketId=${marketId}`);
            if (res.ok) {
                const data = await res.json();
                setPacing(data.pacing || []);
            }
        } catch (e) {
            console.error("DemandPacingWidget fetch error:", e);
        } finally {
            setLoading(false);
        }
    }, [dateFrom, dateTo, marketId]);

    useEffect(() => {
        fetchPacing();
    }, [fetchPacing]);

    const isPending = loading || isMarketAnalysisRunning;
    const hasData = pacing.some(p => p.demandScore !== null);

    if (!hasData && !isPending) return null;

    return (
        <div className="border border-border/50 rounded-xl overflow-hidden bg-background text-foreground shadow-sm mb-3">
            <div
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer border-b border-border/30"
            >
                <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-purple-500" />
                    <span className="text-[11px] font-black uppercase tracking-widest">Demand Pacing</span>
                </div>
                <div className="flex items-center gap-2">
                    {!isPending && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-500/10 text-blue-500 border border-blue-500/30">
                            Airbtics API
                        </span>
                    )}
                    {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                </div>
            </div>

            {open && (
                <div className="p-3">
                    <div className="mb-3 p-2 bg-muted/20 border border-border/40 rounded-lg text-[9px] text-muted-foreground leading-relaxed">
                        <strong className="text-foreground">About this data:</strong> Pulled directly from the historical database & Airbtics cache. 
                        <ul className="mt-1 space-y-0.5 list-disc pl-3">
                            <li><strong className="text-foreground">Score:</strong> Numerical index showing relative search volume & booking velocity.</li>
                            <li><strong className="text-foreground">Demand Tier:</strong> Low/Med/High classification to trigger pricing rules.</li>
                            <li><strong className="text-foreground">Mar Avg:</strong> Current average nightly rate (ADR) of neighborhood comps.</li>
                        </ul>
                    </div>
                    {isPending ? (
                        <div className="flex justify-center py-4">
                            <Loader2 className="h-5 w-5 animate-spin text-purple-500" />
                        </div>
                    ) : (
                        <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                            {pacing.map((day, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-muted/10 border border-border/30">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-bold">{format(new Date(day.date), "MMM d, EEE")}</span>
                                        {day.demandTier !== "unknown" && (
                                            <span className={`text-[9px] font-black uppercase tracking-wider mt-0.5 ${
                                                day.demandTier === 'high' ? 'text-red-500' :
                                                day.demandTier === 'medium' ? 'text-primary' : 'text-emerald-500'
                                            }`}>
                                                {day.demandTier} Demand
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex gap-3 text-right">
                                        <div className="flex flex-col">
                                            <span className="text-[8px] text-muted-foreground uppercase">Score</span>
                                            <span className="text-[11px] font-bold">{day.demandScore ?? "-"}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[8px] text-muted-foreground uppercase">Market Avg</span>
                                            <span className="text-[11px] font-bold">{day.avgPrice ? `${currency} ${Math.round(day.avgPrice)}` : "-"}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

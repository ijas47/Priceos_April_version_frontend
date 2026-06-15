"use client";

import { useState, useEffect } from "react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Loader2, Sparkles, AlertTriangle, ExternalLink, ChevronDown, RefreshCw } from "lucide-react";
import { useContextStore } from "@/stores/context-store";

interface MarketEventRow {
    _id: string;
    name: string;
    startDate: string;
    endDate: string;
    impactLevel: "high" | "medium" | "low";
    upliftPct: number;
    description?: string;
    source?: string;
    area?: string;
    isActive: boolean;
}
import { cn } from "@/lib/utils";
import { getOrgId } from "@/lib/auth/client";
import { SourceProvenanceBadge } from "@/components/market/source-provenance-badge";

export function MarketEventsTable() {
    const [events, setEvents] = useState<MarketEventRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [isExpanded, setIsExpanded] = useState(true);

    // We use the same context that the chat uses so the table updates dynamically 
    // if you switch from Portfolio to Property view.
    const {
        contextType,
        propertyId,
        dateRange,
        marketRefreshTrigger,
        triggerMarketRefresh,
        isMarketAnalysisRunning
    } = useContextStore();

    useEffect(() => {
        const fetchEvents = async () => {
            setLoading(true);
            setError(null);
            try {
                const params = new URLSearchParams();
                const orgId = getOrgId();
                if (!orgId) {
                    setError("Not signed in — org context missing");
                    setLoading(false);
                    return;
                }
                params.set("orgId", orgId);
                if (propertyId) params.set("listingId", String(propertyId));
                if (dateRange?.from) params.set("dateFrom", format(dateRange.from, "yyyy-MM-dd"));
                if (dateRange?.to) params.set("dateTo", format(dateRange.to, "yyyy-MM-dd"));

                const res = await fetch(`/api/events?${params}`);
                if (!res.ok) throw new Error("Failed to load events");

                const data = await res.json();
                setEvents(data.events || []);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Error loading events");
            } finally {
                setLoading(false);
            }
        };

        fetchEvents();
    }, [contextType, propertyId, dateRange, marketRefreshTrigger]);

    if (loading || isMarketAnalysisRunning) {
        return (
            <Card className="flex flex-col h-full min-h-[300px] border-dashed border-border/50 shadow-none bg-muted/5 animate-pulse">
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                    <div className="relative">
                        <Loader2 className="h-10 w-10 animate-spin text-primary" />
                        <Sparkles className="h-4 w-4 text-primary absolute -top-1 -right-1 animate-bounce" />
                    </div>
                    <div className="text-center">
                        <p className="text-sm font-black uppercase tracking-widest text-foreground">
                            {isMarketAnalysisRunning ? "Analyzing Market..." : "Loading Signals..."}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1 font-medium italic">
                            {isMarketAnalysisRunning ? "Agents are scanning for global events & local signals" : "Fetching latest intelligence from database"}
                        </p>
                    </div>
                </div>
            </Card>
        );
    }

    if (error) {
        return (
            <Card className="flex flex-col h-full border-red-100 shadow-none bg-red-50/50 min-h-[200px]">
                <div className="flex-1 flex flex-col items-center justify-center text-red-500 gap-2 p-6 text-center">
                    <AlertTriangle className="h-8 w-8 text-red-500 mb-2" />
                    <p className="text-sm font-black uppercase tracking-widest">Connection Error</p>
                    <p className="text-xs font-medium opacity-80">{error}</p>
                    <button
                        onClick={() => triggerMarketRefresh()}
                        className="mt-4 px-4 py-1.5 rounded-full bg-red-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-red-600 transition-colors"
                    >
                        Retry Sync
                    </button>
                </div>
            </Card>
        );
    }

    const handleRunAgent = async () => {
        setLoading(true);
        try {
            const orgId = getOrgId();
            await fetch('/api/market-setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...(orgId ? { orgId } : {}),
                    context: {
                        type: contextType,
                        propertyId: propertyId
                    },
                    dateRange: dateRange
                })
            });
            // Re-trigger the fetch which will update the UI
            triggerMarketRefresh();
        } catch (e) {
            console.error("Failed to run market agent", e);
            setLoading(false);
        }
    };

    if (events.length === 0) {
        return (
            <Card className="flex flex-col h-full border-dashed border-border/50 shadow-none bg-muted/5 min-h-[350px]">
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-5 p-12 text-center">
                    <div className="h-16 w-16 rounded-full bg-background border border-border/50 shadow-sm flex items-center justify-center relative">
                        <CalendarIcon className="h-7 w-7 opacity-20" />
                        <div className="absolute -bottom-1 -right-1 bg-primary/10 rounded-full p-1 border border-primary/30">
                            <Sparkles className="h-3 w-3 text-primary" />
                        </div>
                    </div>
                    <div className="space-y-3">
                        <p className="font-black text-sm text-foreground uppercase tracking-widest">No Market Signals Found</p>
                        <p className="text-[11px] font-medium leading-relaxed max-w-[280px] mx-auto text-muted-foreground">
                            The database has no events for this period. Run the AI Market Agent to scrape the live web for local events, news, and geopolitical signals.
                        </p>
                        <button
                            onClick={handleRunAgent}
                            className="mt-2 inline-flex items-center gap-2 px-5 py-2 rounded-full bg-primary text-white text-[11px] font-black uppercase tracking-widest hover:bg-primary transition-all shadow-sm shadow-primary/20"
                        >
                            <Sparkles className="h-3.5 w-3.5" />
                            Run Market Agent
                        </button>
                    </div>
                </div>
            </Card>
        );
    }

    // Helper to color code the impact badges
    const getImpactBadge = (impact?: string | null) => {
        if (!impact) return <Badge variant="outline" className="text-[10px]">Unknown</Badge>;
        const lower = impact.toLowerCase();
        if (lower.includes("high")) return <Badge className="bg-red-500/10 text-red-500 hover:bg-red-500/20 text-[10px] font-bold tracking-wider uppercase border-none">High</Badge>;
        if (lower.includes("med")) return <Badge className="bg-primary/10 text-primary hover:bg-primary/20 text-[10px] font-bold tracking-wider uppercase border-none">Medium</Badge>;
        return <Badge className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 text-[10px] font-bold tracking-wider uppercase border-none">Low</Badge>;
    };

    return (
        <Card className={cn("flex flex-col rounded-none border-0 shadow-none transition-all duration-300", isExpanded ? "flex-1 min-h-0" : "h-auto shrink-0")}>
            <CardHeader
                className="py-4 px-6 border-b bg-muted/10 sticky top-0 z-10 cursor-pointer hover:bg-muted/20 transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <CardTitle className="text-sm font-bold">Latest Market Signals</CardTitle>
                    </div>
                    <div className="flex items-center gap-3">
                        <Badge variant="secondary" className="text-[10px] font-medium font-mono">
                            {events.length} records
                        </Badge>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleRunAgent();
                            }}
                            disabled={loading || isMarketAnalysisRunning}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors border border-primary/20 disabled:opacity-50"
                            title="Force sync live market signals via AI"
                        >
                            <Sparkles className={cn("h-3 w-3", loading ? "animate-spin" : "")} />
                            <span className="text-[9px] font-black uppercase tracking-widest">Sync Agent</span>
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                triggerMarketRefresh();
                            }}
                            className="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors"
                            title="Refresh from database"
                        >
                            <RefreshCw className={cn("h-3.5 w-3.5", loading ? "animate-spin" : "")} />
                        </button>
                        <ChevronDown className={cn("h-4 w-4 transition-transform text-muted-foreground", isExpanded ? "rotate-180" : "")} />
                    </div>
                </div>
            </CardHeader>

            {isExpanded && (
                <CardContent className="p-0 overflow-auto flex-1">
                    <Table>
                        <TableHeader className="sticky top-0 bg-background/95 backdrop-blur shadow-sm z-20">
                            <TableRow className="hover:bg-transparent [&>th]:text-xs [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wider [&>th]:text-muted-foreground">
                                <TableHead className="w-[120px] pl-6">Date</TableHead>
                                <TableHead>Event Signal</TableHead>
                                <TableHead>Impact</TableHead>
                                <TableHead className="text-right pr-6">Premium Suggestion</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="[&>tr:last-child]:border-0">
                            {events.map((ev) => {
                                const start = new Date(ev.startDate);
                                const end = new Date(ev.endDate);
                                const isSingleDay = ev.startDate === ev.endDate;

                                return (
                                    <TableRow key={ev._id} className="hover:bg-muted/30 group transition-colors">
                                        <TableCell className="pl-6 align-top pt-4">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-sm font-medium whitespace-nowrap">
                                                    {format(start, "MMM d")}
                                                </span>
                                                {!isSingleDay && (
                                                    <span className="text-xs text-muted-foreground whitespace-nowrap opacity-60">
                                                        to {format(end, "MMM d, yy")}
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>

                                        <TableCell className="align-top pt-4">
                                            <div className="flex flex-col gap-1.5 max-w-[300px]">
                                                {ev.source && ev.source.startsWith('http') ? (
                                                    <a
                                                        href={ev.source}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="group/link flex flex-col gap-1.5"
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-bold text-foreground group-hover/link:text-primary transition-colors">
                                                                {ev.name}
                                                            </span>
                                                            <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover/link:opacity-100 transition-all" />
                                                        </div>
                                                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 group-hover:line-clamp-none transition-all hover:text-foreground">
                                                            {ev.description}
                                                        </p>
                                                    </a>
                                                ) : (
                                                    <>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-bold text-foreground">
                                                                {ev.name}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 group-hover:line-clamp-none transition-all">
                                                            {ev.description}
                                                        </p>
                                                    </>
                                                )}

                                                <div className="flex flex-wrap gap-2 mt-1.5">
                                                    {ev.area && (
                                                        <Badge variant="outline" className="text-[9px] bg-blue-500/5 text-blue-500 border-blue-500/20">{ev.area}</Badge>
                                                    )}
                                                    <SourceProvenanceBadge source={ev.source} />
                                                </div>
                                            </div>
                                        </TableCell>

                                        <TableCell className="align-top pt-4">
                                            <div className="flex flex-col gap-2">
                                                {getImpactBadge(ev.impactLevel || 'medium')}
                                            </div>
                                        </TableCell>

                                        <TableCell className="text-right pr-6 align-top pt-4">
                                            {ev.upliftPct > 0 ? (
                                                <div className="inline-flex flex-col items-end">
                                                    <span className="text-sm font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded flex items-center gap-1">
                                                        +{Math.round(ev.upliftPct)}%
                                                    </span>
                                                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground mt-1">
                                                        Target Lift
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-muted-foreground/50 italic">—</span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            )}
        </Card>
    );
}

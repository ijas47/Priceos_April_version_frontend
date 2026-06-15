"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  TrendingUp,
  Globe,
  AlertTriangle,
  Star,
  BarChart2,
  Filter,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BenchmarkPanel } from "@/components/market/benchmark-panel";
import { SourceProvenanceBadge } from "@/components/market/source-provenance-badge";

interface MarketEvent {
  id: string;
  listingId?: string | null;
  title: string;
  startDate: string;
  endDate: string;
  impact: "high" | "medium" | "low";
  suggestedPremiumPct: number;
  description: string;
  category: string;
  area: string;
  source?: string;
  url?: string;
  confidence: number;
  signalScore: number;
  verified: boolean;
}

interface Props {
  orgId: string;
  events: MarketEvent[];
  sourceCounts?: Record<string, number>;
  occupancyPct: number;
  avgNightly: number;
  listings: { id: string; name: string; currencyCode: string; area?: string }[];
}

/** Impact pills: strong contrast in light mode, preserved look in dark */
const IMPACT_STYLES: Record<string, string> = {
  high:
    "bg-red-100 text-red-800 border-red-300 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30",
  medium:
    "bg-primary/100 text-primary border-primary/80 dark:bg-primary/10 dark:text-primary dark:border-primary/30",
  low:
    "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/30",
};

const FILTER_SELECT_CLASS =
  "text-xs min-h-9 rounded-md border border-border bg-background px-3 py-1.5 text-foreground shadow-sm " +
  "focus:outline-none focus:ring-2 focus:ring-primary/35 focus:ring-offset-2 focus:ring-offset-background " +
  "dark:border-white/15 dark:bg-white/[0.06] dark:text-foreground";

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysUntil(dateStr: string) {
  const diff = new Date(dateStr + "T00:00:00").getTime() - Date.now();
  const days = Math.ceil(diff / 86400000);
  if (days < 0) return "Ongoing";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days}d`;
}

function signalBarColor(score: number) {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 45) return "bg-primary";
  return "bg-orange-400";
}

export function MarketIntelligenceClient({
  orgId,
  events,
  sourceCounts = {},
  occupancyPct,
  avgNightly,
  listings,
}: Props) {
  const router = useRouter();
  const [selectedListingId, setSelectedListingId] = useState<string>(listings[0]?.id ?? "");
  const [filterImpact, setFilterImpact] = useState<"all" | "high" | "medium" | "low">("all");
  const [filterArea, setFilterArea] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<"all" | "events" | "news">("all");
  const [showUnverified, setShowUnverified] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const verifiedEvents = useMemo(() => events.filter((e) => e.verified), [events]);
  const unverifiedCount = events.length - verifiedEvents.length;

  async function handleSyncEvents() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/v1/system/events/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, daysAhead: 90, marketCity: "Dubai" }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSyncMsg(json?.error?.message || "Sync failed");
      } else {
        const { inserted = 0, listings: listingCount = 0, sourceBreakdown = {} } = json.data ?? {};
        const feedParts = Object.entries(sourceBreakdown as Record<string, number>)
          .filter(([, n]) => n > 0)
          .map(([k, n]) => `${k}: ${n}`)
          .join(", ");
        setSyncMsg(
          `Synced ${listingCount} listings — ${inserted} signals${feedParts ? ` (${feedParts})` : ""}`
        );
        router.refresh();
      }
    } catch {
      setSyncMsg("Network error — check connection");
    } finally {
      setSyncing(false);
    }
  }

  const areas = useMemo(() => {
    const fromEvents = events.flatMap((e) => (e.area ? [e.area] : []));
    const fromListings = listings.flatMap((l) => (l.area ? [l.area] : []));
    const merged = Array.from(new Set([...fromEvents, ...fromListings].filter(Boolean)));
    return merged.sort();
  }, [events, listings]);

  const filteredEvents = useMemo(() => {
    const pool = showUnverified ? events : verifiedEvents;
    return pool
      .filter((e) => {
        if (filterImpact !== "all" && e.impact !== filterImpact) return false;
        if (filterArea !== "all" && e.area !== filterArea) return false;
        if (filterCategory === "events" && e.category === "News") return false;
        if (filterCategory === "news" && e.category !== "News") return false;
        return true;
      })
      .sort((a, b) => b.signalScore - a.signalScore || a.startDate.localeCompare(b.startDate));
  }, [events, verifiedEvents, showUnverified, filterImpact, filterArea, filterCategory]);

  const upcomingHigh = verifiedEvents.filter((e) => e.impact === "high");
  const upcomingMedium = verifiedEvents.filter((e) => e.impact === "medium");

  const IMPACT_PILL = [
    { id: "all", label: "All" },
    { id: "high", label: "High" },
    { id: "medium", label: "Medium" },
    { id: "low", label: "Low" },
  ] as const;

  return (
    <div className="p-8 max-w-6xl space-y-8">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight mb-1">Market Intelligence</h1>
          <p className="text-text-secondary text-sm flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5" />
            Your market — live events, demand signals, and comp positioning
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <button
            onClick={handleSyncEvents}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-amber/40 bg-amber/10 text-amber text-xs font-semibold hover:bg-amber/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync Events"}
          </button>
          {syncMsg && (
            <span className="text-[11px] text-muted-foreground">{syncMsg}</span>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <TooltipProvider>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            {
              label: "Portfolio Occupancy",
              value: `${occupancyPct}%`,
              sub: "Next 30 days",
              icon: BarChart2,
              color: occupancyPct > 70 ? "text-green-400" : occupancyPct > 40 ? "text-primary" : "text-red-400",
              tooltip: "Real-time occupancy synced from Hostaway/PMS.",
            },
            {
              label: "Avg Nightly Rate",
              value: avgNightly > 0 ? `${listings[0]?.currencyCode ?? "AED"} ${avgNightly.toLocaleString("en-US")}` : "—",
              sub: "Portfolio average",
              icon: TrendingUp,
              color: "text-blue-400",
              tooltip: "Average gross revenue per night across all properties.",
            },
            {
              label: "High-Impact Events",
              value: upcomingHigh.length,
              sub: "Next 90 days",
              icon: Star,
              color: "text-red-400",
              tooltip: "Local events with high demand potential (Pass 1).",
            },
            {
              label: "Verified Signals",
              value: verifiedEvents.length,
              sub: unverifiedCount > 0 ? `${unverifiedCount} unverified hidden` : "Next 90 days",
              icon: Calendar,
              color: "text-primary",
              tooltip: "Ticketed, SERP, NewsAPI, and annual calendar signals. AI-detected items are hidden by default.",
            },
          ].map((kpi) => (
            <Tooltip key={kpi.label}>
              <TooltipTrigger asChild>
                <div
                  className="rounded-xl border border-white/5 bg-white/[0.02] p-4 flex flex-col gap-2 cursor-help transition-colors hover:bg-white/[0.04]"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground font-medium">{kpi.label}</span>
                    <kpi.icon className={cn("h-4 w-4", kpi.color)} />
                  </div>
                  <div className={cn("text-2xl font-bold tabular-nums", kpi.color)}>{kpi.value}</div>
                  <div className="text-[11px] text-muted-foreground/70">{kpi.sub}</div>
                </div>
              </TooltipTrigger>
              <TooltipContent className="text-[10px] p-2 dark:bg-black border border-white/20">
                {kpi.tooltip}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>

      {/* Event Calendar — table + high-contrast filters (light + dark) */}
      <div className="rounded-xl border border-border bg-card text-card-foreground overflow-hidden shadow-sm dark:border-white/10 dark:bg-white/[0.02]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border dark:border-white/10">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Event Calendar</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ranked by signal score · {filteredEvents.length} shown
              {!showUnverified && unverifiedCount > 0 ? ` (${unverifiedCount} unverified hidden)` : ""}
            </p>
          </div>
          {upcomingHigh.length > 0 && (
            <Badge className="bg-red-100 text-red-800 border border-red-300 text-[10px] font-semibold dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30">
              {upcomingHigh.length} high-impact
            </Badge>
          )}
        </div>

        {/* Feed sources */}
        {Object.keys(sourceCounts).length > 0 && (
          <div className="px-5 py-2.5 border-b border-border bg-muted/20 flex flex-wrap gap-2 dark:border-white/10">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground self-center mr-1">
              Active feeds
            </span>
            {Object.entries(sourceCounts)
              .sort(([, a], [, b]) => b - a)
              .map(([src, count]) => (
                <SourceProvenanceBadge key={src} source={src} showUnverifiedWarning={false} />
              ))}
          </div>
        )}

        {/* Filter bar */}
        {events.length > 0 && (
          <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-3 flex-wrap dark:border-white/10 dark:bg-white/[0.02]">
            <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

            <div className="flex items-center gap-1.5">
              {(["all", "events", "news"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilterCategory(id)}
                  className={cn(
                    "text-xs font-medium px-3 py-1.5 rounded-md border transition-colors capitalize",
                    filterCategory === id
                      ? "border-primary bg-primary/100 text-primary/950 shadow-sm dark:border-amber/40 dark:bg-amber/15 dark:text-amber"
                      : "border-border bg-background text-foreground/90 hover:bg-muted dark:border-white/15 dark:bg-transparent dark:text-zinc-300"
                  )}
                >
                  {id}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showUnverified}
                onChange={(e) => setShowUnverified(e.target.checked)}
                className="rounded border-border"
              />
              Show unverified ({unverifiedCount})
            </label>

            {/* Impact filter */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {IMPACT_PILL.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilterImpact(id)}
                  className={cn(
                    "text-xs font-medium px-3 py-1.5 rounded-md border transition-colors",
                    filterImpact === id
                      ? "border-primary bg-primary/100 text-primary/950 shadow-sm dark:border-amber/40 dark:bg-amber/15 dark:text-amber"
                      : "border-border bg-background text-foreground/90 hover:bg-muted hover:text-foreground dark:border-white/15 dark:bg-transparent dark:text-zinc-300 dark:hover:bg-white/5 dark:hover:text-white"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Area filter */}
            {areas.length > 0 && (
              <select
                value={filterArea}
                onChange={(e) => setFilterArea(e.target.value)}
                className={FILTER_SELECT_CLASS}
              >
                <option value="all">All areas</option>
                {areas.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            )}

            {(filterImpact !== "all" || filterArea !== "all" || filterCategory !== "all") && (
              <button
                type="button"
                onClick={() => { setFilterImpact("all"); setFilterArea("all"); setFilterCategory("all"); }}
                className="text-xs font-medium text-primary hover:text-primary underline-offset-2 hover:underline ml-auto dark:text-amber dark:hover:text-amber/90"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 px-5">
            <Calendar className="h-8 w-8 text-muted-foreground" />
            {events.length === 0 ? (
              <>
                <p className="text-muted-foreground text-sm">No events in the next 90 days.</p>
                <p className="text-muted-foreground/80 text-xs">Run Market Analysis to fetch live event data.</p>
              </>
            ) : (
              <>
                <p className="text-muted-foreground text-sm">No events match the current filters.</p>
                <button
                  type="button"
                  onClick={() => { setFilterImpact("all"); setFilterArea("all"); }}
                  className="text-xs font-medium text-primary hover:underline dark:text-amber"
                >
                  Clear filters
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="px-2 pb-2 sm:px-4">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent dark:border-white/10">
                  <TableHead className="min-w-[120px] pl-4 text-xs font-semibold text-foreground">Date range</TableHead>
                  <TableHead className="min-w-[200px] text-xs font-semibold text-foreground">Event</TableHead>
                  <TableHead className="w-[88px] text-xs font-semibold text-foreground">Signal</TableHead>
                  <TableHead className="w-[100px] text-xs font-semibold text-foreground">Impact</TableHead>
                  <TableHead className="w-[88px] text-xs font-semibold text-foreground">Timeline</TableHead>
                  <TableHead className="w-[72px] text-right text-xs font-semibold text-foreground">Uplift</TableHead>
                  <TableHead className="hidden md:table-cell w-[120px] text-xs font-semibold text-foreground">Source</TableHead>
                  <TableHead className="hidden sm:table-cell w-[88px] text-xs font-semibold text-foreground">Area</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEvents.map((event) => {
                  return (
                  <TableRow
                    key={event.id}
                    className="border-border dark:border-white/10"
                  >
                    <TableCell className="align-top pl-4 py-3 text-sm">
                      <div className="font-medium text-foreground tabular-nums">{formatDate(event.startDate)}</div>
                      {event.startDate !== event.endDate && (
                        <div className="text-xs text-muted-foreground">→ {formatDate(event.endDate)}</div>
                      )}
                    </TableCell>
                    <TableCell className="align-top py-3 max-w-[min(360px,50vw)]">
                      {(() => {
                        const href = event.url || (event.source?.startsWith("http") ? event.source : null);
                        return href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="group/link inline-flex flex-col gap-1"
                          >
                            <span className="font-medium text-foreground leading-snug group-hover/link:text-amber underline-offset-2 group-hover/link:underline flex items-center gap-1.5">
                              {event.title}
                              <ExternalLink className="h-3 w-3 shrink-0 opacity-40 group-hover/link:opacity-100 transition-opacity" />
                            </span>
                            {event.description && (
                              <span className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{event.description}</span>
                            )}
                          </a>
                        ) : (
                          <>
                            <div className="font-medium text-foreground leading-snug">{event.title}</div>
                            {event.description && (
                              <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{event.description}</div>
                            )}
                          </>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="align-top py-3">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex flex-col gap-1 min-w-[72px]">
                              <span className="text-xs font-bold tabular-nums text-foreground">
                                {event.signalScore}
                              </span>
                              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                <div
                                  className={cn("h-full rounded-full", signalBarColor(event.signalScore))}
                                  style={{ width: `${event.signalScore}%` }}
                                />
                              </div>
                              <span className="text-[9px] text-muted-foreground tabular-nums">
                                {event.confidence}% conf
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="text-[10px] max-w-[220px]">
                            Signal score blends impact, source trust, and uplift. Verified API feeds rank highest; AI-detected sinks to the bottom.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell className="align-top py-3">
                      <span
                        className={cn(
                          "inline-flex text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md border",
                          IMPACT_STYLES[event.impact] || IMPACT_STYLES.medium
                        )}
                      >
                        {event.impact}
                      </span>
                    </TableCell>
                    <TableCell className="align-top py-3 text-sm text-foreground tabular-nums">
                      {daysUntil(event.startDate)}
                    </TableCell>
                    <TableCell className="align-top py-3 text-right text-sm font-semibold tabular-nums">
                      {event.suggestedPremiumPct !== 0 ? (
                        <span
                          className={cn(
                            event.suggestedPremiumPct > 0
                              ? "text-emerald-700 dark:text-green-400"
                              : "text-red-700 dark:text-red-400"
                          )}
                        >
                          {event.suggestedPremiumPct > 0 ? "+" : ""}
                          {event.suggestedPremiumPct}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell align-top py-3">
                      <SourceProvenanceBadge source={event.source} />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell align-top py-3">
                      {event.area ? (
                        <span className="inline-flex text-[11px] font-medium px-2 py-0.5 rounded-md border border-border bg-muted text-foreground dark:border-white/20 dark:bg-white/5">
                          {event.area}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Competitor Benchmark Panel */}
      {listings.length > 0 && (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Competitor Benchmark</h2>
              <p className="text-xs text-text-tertiary mt-0.5">Rate positioning vs. comp set</p>
            </div>
            {listings.length > 1 && (
              <select
                value={selectedListingId}
                onChange={(e) => setSelectedListingId(e.target.value)}
                className="text-xs bg-white/[0.04] border border-white/10 rounded-lg px-3 py-1.5 text-text-primary focus:outline-none focus:ring-1 focus:ring-amber/40"
              >
                {listings.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="p-5">
            <BenchmarkPanel
              orgId={orgId}
              listingId={selectedListingId}
              listingName={listings.find((l) => l.id === selectedListingId)?.name ?? ""}
              currency={listings.find((l) => l.id === selectedListingId)?.currencyCode ?? "AED"}
            />
          </div>
        </div>
      )}
    </div>
  );
}

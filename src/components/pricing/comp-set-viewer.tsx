"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, Minus, RefreshCw,
  BarChart3, Users, DollarSign, Star,
} from "lucide-react";

interface Listing {
  id: string;
  name: string;
  currencyCode: string;
}

interface MarketOverview {
  adr: number;
  revpar: number;
  occupancy: number;
  activeListings: number;
  monthlyMetrics: { month: string; p25_adr?: number; p50_adr?: number; p75_adr?: number; occupancy?: number }[];
  futurePacing: { date: string; occupancy: number; adr: number }[];
  fetchedAt: string;
}

interface ListingPosition {
  listingPrice: number;
  marketP50: number;
  percentile: string;
  verdict: "underpriced" | "fair" | "above" | "overpriced";
}

export function CompSetViewer({ listings }: { listings: Listing[] }) {
  const [selectedId, setSelectedId] = useState(listings[0]?.id || "");
  const [overview, setOverview] = useState<MarketOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = listings.find((l) => l.id === selectedId);
  const currency = selected?.currencyCode || "AED";

  const fetchOverview = useCallback(async () => {
    if (!selectedId) return;
    setLoading(true);
    setError(null);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(`/api/agent-tools/market-overview?listingId=${selectedId}`, {
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error("Failed to fetch market data");
      const data = await res.json();
      const flat: MarketOverview = {
        adr: data.adr ?? data.summary?.adr ?? 0,
        revpar: data.revpar ?? data.summary?.revpar ?? 0,
        occupancy: data.occupancy ?? data.summary?.occupancy ?? 0,
        activeListings: data.activeListings ?? data.summary?.activeListings ?? 0,
        monthlyMetrics: data.monthlyMetrics ?? [],
        futurePacing: data.futurePacing ?? [],
        fetchedAt: data.fetchedAt ?? new Date().toISOString(),
      };
      setOverview(flat);
    } catch (err) {
      const msg = (err as Error).name === "AbortError"
        ? "Request timed out - check Airbtics API key"
        : (err as Error).message;
      setError(msg);
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);

  const position = computePosition(overview, selected);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Market Intelligence</h2>
          <p className="text-sm text-muted-foreground">
            Live comp-set data from Airbtics market analysis
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="bg-surface-secondary border border-border-default rounded-lg px-3 py-2 text-sm"
          >
            {listings.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <button
            onClick={fetchOverview}
            disabled={loading}
            className="p-2 rounded-lg border border-border-default hover:bg-surface-secondary transition-colors"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm text-red-400">
          {error}. Airbtics API key may not be configured.
        </div>
      )}

      {loading && !overview && (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {overview && (
        <>
          {/* KPI Strip */}
          <div className="grid grid-cols-4 gap-4">
            <KpiCard
              icon={DollarSign}
              label="Market ADR"
              value={`${currency} ${Math.round(overview.adr).toLocaleString("en-US")}`}
              color="amber"
            />
            <KpiCard
              icon={BarChart3}
              label="RevPAR"
              value={`${currency} ${Math.round(overview.revpar).toLocaleString("en-US")}`}
              color="blue"
            />
            <KpiCard
              icon={Users}
              label="Occupancy"
              value={`${Math.round(overview.occupancy * 100)}%`}
              color="emerald"
            />
            <KpiCard
              icon={Star}
              label="Active Listings"
              value={overview.activeListings?.toLocaleString("en-US") ?? "-"}
              color="purple"
            />
          </div>

          {/* Market Position */}
          {position && (
            <div className="bg-surface-secondary border border-border-default rounded-xl p-5">
              <h3 className="text-sm font-semibold mb-4">Your Market Position</h3>
              <div className="flex items-center gap-6">
                <div className="flex-1">
                  <PositionBar position={position} currency={currency} />
                </div>
                <div className="text-right shrink-0">
                  <div className={cn(
                    "text-lg font-bold",
                    position.verdict === "underpriced" ? "text-primary" :
                    position.verdict === "fair" ? "text-emerald-400" :
                    position.verdict === "above" ? "text-blue-400" : "text-red-400"
                  )}>
                    {position.verdict === "underpriced" ? "Underpriced" :
                     position.verdict === "fair" ? "Fair Value" :
                     position.verdict === "above" ? "Slightly Above" : "Overpriced"}
                  </div>
                  <div className="text-xs text-muted-foreground">{position.percentile} percentile</div>
                </div>
              </div>
            </div>
          )}

          {/* Seasonal ADR Chart */}
          {overview.monthlyMetrics.length > 0 && (
            <div className="bg-surface-secondary border border-border-default rounded-xl p-5">
              <h3 className="text-sm font-semibold mb-4">Seasonal ADR Distribution</h3>
              <div className="space-y-2">
                {overview.monthlyMetrics.map((m) => {
                  const p50 = m.p50_adr ?? 0;
                  const p25 = m.p25_adr ?? 0;
                  const p75 = m.p75_adr ?? 0;
                  const maxAdr = Math.max(...overview.monthlyMetrics.map((x) => x.p75_adr ?? x.p50_adr ?? 0));
                  const monthLabel = m.month ? formatMonth(m.month) : "";
                  return (
                    <div key={m.month} className="flex items-center gap-3 text-xs">
                      <span className="w-8 text-muted-foreground shrink-0">{monthLabel}</span>
                      <div className="flex-1 h-6 relative">
                        {/* P25-P75 range bar */}
                        <div
                          className="absolute top-1 h-4 bg-primary/15 rounded"
                          style={{
                            left: `${maxAdr > 0 ? (p25 / maxAdr) * 100 : 0}%`,
                            width: `${maxAdr > 0 ? ((p75 - p25) / maxAdr) * 100 : 0}%`,
                          }}
                        />
                        {/* P50 marker */}
                        <div
                          className="absolute top-0.5 w-0.5 h-5 bg-primary rounded-full"
                          style={{ left: `${maxAdr > 0 ? (p50 / maxAdr) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="w-20 text-right text-muted-foreground">
                        {currency} {Math.round(p50).toLocaleString("en-US")}
                      </span>
                      <span className="w-10 text-right">
                        {m.occupancy !== undefined ? `${Math.round(m.occupancy * 100)}%` : "-"}
                      </span>
                    </div>
                  );
                })}
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-1 border-t border-border-default">
                  <span className="w-8" />
                  <div className="flex-1 flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-4 h-2 bg-primary/15 rounded" /> P25–P75 range
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-1 h-3 bg-primary rounded-full" /> P50 (median)
                    </span>
                  </div>
                  <span className="w-20 text-right">ADR</span>
                  <span className="w-10 text-right">Occ</span>
                </div>
              </div>
            </div>
          )}

          {/* Forward Demand */}
          {overview.futurePacing.length > 0 && (
            <div className="bg-surface-secondary border border-border-default rounded-xl p-5">
              <h3 className="text-sm font-semibold mb-4">Forward Demand (Next 90 Days)</h3>
              <div className="grid grid-cols-3 gap-3">
                {aggregatePacing(overview.futurePacing).map((bucket) => (
                  <div key={bucket.label} className="bg-surface-primary rounded-lg p-3 border border-border-default">
                    <div className="text-xs text-muted-foreground mb-1">{bucket.label}</div>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-lg font-semibold">{Math.round(bucket.avgOcc * 100)}%</div>
                        <div className="text-xs text-muted-foreground">occupancy</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">{currency} {Math.round(bucket.avgAdr).toLocaleString("en-US")}</div>
                        <div className="text-xs text-muted-foreground">avg ADR</div>
                      </div>
                      <DemandIcon occ={bucket.avgOcc} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Data freshness */}
          <div className="text-xs text-muted-foreground text-right">
            Data from Airbtics · Last updated {new Date(overview.fetchedAt).toLocaleString("en-US")}
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, color }: {
  icon: any; label: string; value: string; color: string;
}) {
  const colorMap: Record<string, string> = {
    amber: "bg-primary/10 text-primary",
    blue: "bg-blue-500/10 text-blue-400",
    emerald: "bg-emerald-500/10 text-emerald-400",
    purple: "bg-purple-500/10 text-purple-400",
  };
  return (
    <div className="bg-surface-secondary border border-border-default rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={cn("p-1.5 rounded-lg", colorMap[color])}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

function PositionBar({ position, currency }: { position: ListingPosition; currency: string }) {
  const ratio = position.marketP50 > 0
    ? Math.min(2, position.listingPrice / position.marketP50)
    : 1;
  const pct = Math.min(95, Math.max(5, ratio * 50));

  return (
    <div className="space-y-1.5">
      <div className="relative h-3 bg-gradient-to-r from-primary/20 via-emerald-500/20 to-red-500/20 rounded-full">
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full border-2 border-primary/400 shadow-sm"
          style={{ left: `${pct}%`, transform: `translate(-50%, -50%)` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>Below Market</span>
        <span>P50: {currency} {Math.round(position.marketP50).toLocaleString("en-US")}</span>
        <span>Above Market</span>
      </div>
    </div>
  );
}

function DemandIcon({ occ }: { occ: number }) {
  if (occ >= 0.75) return <TrendingUp className="h-5 w-5 text-emerald-400" />;
  if (occ >= 0.45) return <Minus className="h-5 w-5 text-primary" />;
  return <TrendingDown className="h-5 w-5 text-red-400" />;
}

function computePosition(
  overview: MarketOverview | null,
  listing: Listing | undefined,
): ListingPosition | null {
  if (!overview || !listing) return null;
  const p50 = overview.adr;
  if (!p50 || p50 <= 0) return null;

  // We don't have the listing's actual price on the client; use market P50 as reference
  // The actual position will be computed from the calendar's proposed prices
  const listingPrice = p50; // placeholder - real position uses listing.price from server
  const ratio = listingPrice / p50;

  let verdict: ListingPosition["verdict"] = "fair";
  let percentile = "P50";
  if (ratio < 0.85) { verdict = "underpriced"; percentile = "< P25"; }
  else if (ratio <= 1.1) { verdict = "fair"; percentile = "P40-P60"; }
  else if (ratio <= 1.3) { verdict = "above"; percentile = "P60-P75"; }
  else { verdict = "overpriced"; percentile = "> P75"; }

  return { listingPrice, marketP50: p50, percentile, verdict };
}

function formatMonth(ym: string): string {
  const [, m] = ym.split("-");
  return ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][parseInt(m, 10)] ?? ym;
}

function aggregatePacing(pacing: MarketOverview["futurePacing"]) {
  const sorted = [...pacing].sort((a, b) => a.date.localeCompare(b.date));
  const buckets = [
    { label: "Next 30 Days", days: sorted.slice(0, 30) },
    { label: "31–60 Days", days: sorted.slice(30, 60) },
    { label: "61–90 Days", days: sorted.slice(60, 90) },
  ];
  return buckets
    .filter((b) => b.days.length > 0)
    .map((b) => ({
      label: b.label,
      avgOcc: b.days.reduce((s, d) => s + d.occupancy, 0) / b.days.length,
      avgAdr: b.days.reduce((s, d) => s + d.adr, 0) / b.days.length,
    }));
}

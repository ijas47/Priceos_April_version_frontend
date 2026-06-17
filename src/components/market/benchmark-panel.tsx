"use client";

import { useEffect, useState } from "react";
import { format, addDays } from "date-fns";
import {
  TrendingUp, TrendingDown, Minus, BarChart2,
  RefreshCw, ExternalLink, ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Comp {
  name: string;
  source: string;
  sourceUrl?: string;
  rating?: number;
  reviews?: number;
  avgRate: number;
  weekdayRate?: number;
  weekendRate?: number;
}

interface BenchmarkSummary {
  listingId: string;
  dateFrom: string;
  dateTo: string;
  p25Rate?: number;
  p50Rate?: number;
  p75Rate?: number;
  p90Rate?: number;
  avgWeekday?: number;
  avgWeekend?: number;
  yourPrice?: number;
  percentile?: number;
  verdict?: "UNDERPRICED" | "FAIR" | "SLIGHTLY_ABOVE" | "OVERPRICED";
  rateTrend?: "rising" | "stable" | "falling";
  trendPct?: number;
  recommendedWeekday?: number;
  recommendedWeekend?: number;
  reasoning?: string;
  comps: Comp[];
}

interface Props {
  orgId: string;
  listingId: string;
  listingName: string;
  currency?: string;
}

const VERDICT_STYLES: Record<string, string> = {
  UNDERPRICED: "bg-red-500/10 text-red-400 border-red-500/20",
  FAIR: "bg-green-500/10 text-green-400 border-green-500/20",
  SLIGHTLY_ABOVE: "bg-primary/10 text-primary border-primary/20",
  OVERPRICED: "bg-red-500/10 text-red-400 border-red-500/20",
};

const VERDICT_LABEL: Record<string, string> = {
  UNDERPRICED: "Underpriced",
  FAIR: "Fair",
  SLIGHTLY_ABOVE: "Slightly Above",
  OVERPRICED: "Overpriced",
};

function percentileBar(pct: number | undefined) {
  if (pct == null) return null;
  return (
    <div className="relative h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
      <div
        className={cn(
          "absolute left-0 top-0 h-full rounded-full",
          pct < 30 ? "bg-red-400" : pct < 60 ? "bg-primary" : "bg-green-400"
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function BenchmarkPanel({ orgId, listingId, listingName, currency = "AED" }: Props) {
  const [data, setData] = useState<BenchmarkSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showComps, setShowComps] = useState(false);

  useEffect(() => {
    if (!listingId || !orgId) return;
    setLoading(true);
    setData(null);
    const today = new Date();
    const dateFrom = format(today, "yyyy-MM-dd");
    const dateTo = format(addDays(today, 29), "yyyy-MM-dd");
    fetch(`/api/agent-tools/benchmark?orgId=${orgId}&listingId=${listingId}&dateFrom=${dateFrom}&dateTo=${dateTo}`)
      .then((r) => r.json())
      .then((d) => {
        // source="none" means no data anywhere
        if (!d || d.source === "none" || (!d.p25 && !d.p50 && !d.p75)) {
          setData(null);
          return;
        }
        // Normalise comp objects - cache vs BenchmarkData have slightly different shapes
        const comps: Comp[] = (d.comps ?? []).map((c: any) => ({
          name: c.name || c.listing_name || "Unknown",
          source: c.source || c.platform || "Market",
          sourceUrl: c.sourceUrl || c.url,
          rating: c.rating ?? c.starRating,
          reviews: c.reviews ?? c.reviewCount,
          avgRate: c.avgRate ?? c.avgAdr ?? c.price ?? 0,
          weekdayRate: c.weekdayRate ?? c.weekday_rate,
          weekendRate: c.weekendRate ?? c.weekend_rate,
        }));
        setData({
          listingId,
          dateFrom,
          dateTo,
          p25Rate: d.p25,
          p50Rate: d.p50,
          p75Rate: d.p75,
          p90Rate: d.p90,
          avgWeekday: d.avgWeekday,
          avgWeekend: d.avgWeekend,
          recommendedWeekday: d.recommendedWeekday,
          recommendedWeekend: d.recommendedWeekend,
          verdict: d.verdict,
          rateTrend: d.rateTrend,
          trendPct: d.trendPct,
          reasoning: d.reasoning,
          comps,
        });
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [listingId, orgId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-text-disabled text-sm">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Loading comp data…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-white/5 bg-white/[0.02] px-5 py-8 text-center">
        <BarChart2 className="h-7 w-7 text-text-disabled mx-auto mb-2" />
        <p className="text-text-tertiary text-sm">No benchmark data for <strong className="text-text-primary">{listingName}</strong></p>
        <p className="text-text-disabled text-xs mt-1">Click <strong>Sync Events</strong> above to fetch live competitor rates from the market.</p>
      </div>
    );
  }

  const TrendIcon = data.rateTrend === "rising" ? TrendingUp : data.rateTrend === "falling" ? TrendingDown : Minus;
  const trendColor = data.rateTrend === "rising" ? "text-green-400" : data.rateTrend === "falling" ? "text-red-400" : "text-text-tertiary";

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-text-primary">{listingName}</p>
          <p className="text-[11px] text-text-tertiary">
            {data.dateFrom} → {data.dateTo} · {data.comps.length} comps
          </p>
        </div>
        {data.verdict && (
          <span className={cn(
            "text-[11px] font-semibold px-2.5 py-1 rounded-full border",
            VERDICT_STYLES[data.verdict]
          )}>
            {VERDICT_LABEL[data.verdict]}
          </span>
        )}
      </div>

      {/* Percentile bar */}
      {data.percentile != null && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px]">
            <span className="text-text-tertiary">Your position</span>
            <span className="text-text-primary font-medium">P{Math.round(data.percentile)}</span>
          </div>
          {percentileBar(data.percentile)}
          <div className="flex justify-between text-[10px] text-text-disabled">
            <span>P25: {data.p25Rate ?? "-"}</span>
            <span>P50: {data.p50Rate ?? "-"}</span>
            <span>P75: {data.p75Rate ?? "-"}</span>
            <span>P90: {data.p90Rate ?? "-"}</span>
          </div>
        </div>
      )}

      {/* Key stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "Your Price", value: data.yourPrice, highlight: true },
          { label: "Market Median", value: data.p50Rate },
          { label: "Rec. Weekday", value: data.recommendedWeekday },
          { label: "Rec. Weekend", value: data.recommendedWeekend },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
            <p className="text-[10px] text-text-tertiary mb-0.5">{s.label}</p>
            <p className={cn(
              "text-sm font-bold tabular-nums",
              s.highlight ? "text-primary" : "text-text-primary"
            )}>
              {s.value ? `${currency} ${s.value.toLocaleString("en-US")}` : "-"}
            </p>
          </div>
        ))}
      </div>

      {/* Trend + reasoning */}
      <div className="flex items-center gap-2">
        <TrendIcon className={cn("h-3.5 w-3.5", trendColor)} />
        <span className={cn("text-xs font-medium", trendColor)}>
          Rates {data.rateTrend ?? "stable"}
          {data.trendPct != null && ` ${data.trendPct > 0 ? "+" : ""}${data.trendPct}%`}
        </span>
      </div>

      {data.reasoning && (
        <p className="text-xs text-text-secondary leading-relaxed border-l-2 border-amber/30 pl-3">
          {data.reasoning}
        </p>
      )}

      {/* Comp table toggle */}
      {data.comps.length > 0 && (
        <div>
          <button
            onClick={() => setShowComps((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-amber hover:text-amber/80 transition-colors font-medium"
          >
            {showComps ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {showComps ? "Hide" : "Show"} {data.comps.length} competitor listings
          </button>

          {showComps && (
            <div className="mt-3 rounded-xl border border-white/5 overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2 border-b border-white/5 bg-white/[0.02]">
                <span className="text-[10px] font-semibold text-text-disabled uppercase tracking-wider">Comp</span>
                <span className="text-[10px] font-semibold text-text-disabled uppercase tracking-wider text-right">Avg Rate</span>
                <span className="text-[10px] font-semibold text-text-disabled uppercase tracking-wider text-right">Rating</span>
                <span className="text-[10px] font-semibold text-text-disabled uppercase tracking-wider text-right">Source</span>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {data.comps.map((comp, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2.5 items-center hover:bg-white/[0.02] transition-colors">
                    <div className="min-w-0">
                      <p className="text-xs text-text-primary truncate">{comp.name}</p>
                    </div>
                    <p className="text-xs font-medium text-text-primary text-right tabular-nums">
                      {comp.avgRate.toLocaleString("en-US")}
                    </p>
                    <p className="text-xs text-text-tertiary text-right">
                      {comp.rating ? `★ ${comp.rating}` : "-"}
                    </p>
                    <div className="flex justify-end">
                      {comp.sourceUrl ? (
                        <a
                          href={comp.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[10px] text-amber/60 hover:text-amber flex items-center gap-0.5"
                        >
                          {comp.source}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      ) : (
                        <span className="text-[10px] text-text-disabled">{comp.source}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

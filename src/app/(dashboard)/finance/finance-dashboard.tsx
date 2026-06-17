"use client";

import { useMemo } from "react";
import {
  DollarSign,
  TrendingUp,
  Building2,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  BarChart2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  listings: Record<string, unknown>[];
  portfolio: Record<string, unknown>;
  proposals: Record<string, unknown>[];
}

function kpiCard(
  label: string,
  value: string,
  sub: string,
  Icon: React.ElementType,
  color: string
) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3 dark:border-white/10 dark:bg-white/[0.02]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Icon className={cn("h-4 w-4", color)} />
      </div>
      <div className={cn("text-2xl font-bold tabular-nums", color)}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}

export function FinanceDashboard({ listings, portfolio, proposals }: Props) {
  const currency = useMemo(() => {
    const l = listings[0] as Record<string, unknown> | undefined;
    return (l?.currencyCode as string) ?? "AED";
  }, [listings]);

  const occupancyPct = Number((portfolio as Record<string, unknown>)?.occupancyPct ?? 0);
  const avgNightly = Number((portfolio as Record<string, unknown>)?.avgNightly ?? 0);

  const totalApprovedUplift = useMemo(() => {
    return proposals.reduce((sum, p) => {
      const current = Number((p as Record<string, unknown>).currentPrice ?? 0);
      const proposed = Number((p as Record<string, unknown>).proposedPrice ?? 0);
      return sum + Math.max(0, proposed - current);
    }, 0);
  }, [proposals]);

  const approvedCount = proposals.length;

  const listingRows = useMemo(() =>
    listings.map((l) => {
      const r = l as Record<string, unknown>;
      return {
        id: String(r._id ?? r.id ?? ""),
        name: String(r.name ?? "Property"),
        area: String(r.area ?? r.neighborhood ?? "-"),
        price: Number(r.price ?? r.basePrice ?? 0),
        floor: Number(r.priceFloor ?? 0),
        ceiling: Number(r.priceCeiling ?? 0),
        currency: String(r.currencyCode ?? currency),
      };
    }),
    [listings, currency]
  );

  return (
    <div className="p-8 max-w-6xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-1">Revenue Overview</h1>
        <p className="text-muted-foreground text-sm">
          Portfolio financial summary - pricing impact and property rate positioning.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {kpiCard(
          "Avg Nightly Rate",
          avgNightly > 0 ? `${currency} ${avgNightly.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "-",
          "Portfolio average",
          DollarSign,
          "text-primary"
        )}
        {kpiCard(
          "Portfolio Occupancy",
          `${occupancyPct}%`,
          "Next 30 days",
          BarChart2,
          occupancyPct > 70 ? "text-emerald-500" : occupancyPct > 40 ? "text-primary" : "text-red-400"
        )}
        {kpiCard(
          "Properties",
          String(listings.length),
          "Active in portfolio",
          Building2,
          "text-blue-400"
        )}
        {kpiCard(
          "Approved Proposals",
          String(approvedCount),
          `+${currency} ${totalApprovedUplift.toLocaleString("en-US", { maximumFractionDigits: 0 })} total uplift`,
          CheckCircle2,
          "text-emerald-500"
        )}
      </div>

      {/* Property rate table */}
      <div className="rounded-xl border border-border dark:border-white/10 overflow-hidden">
        <div className="px-5 py-4 border-b border-border dark:border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Property Rate Positioning</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Current base rate vs. guardrail floor and ceiling</p>
          </div>
          <TrendingUp className="h-4 w-4 text-primary" />
        </div>

        {listingRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Building2 className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No properties loaded.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 dark:bg-white/[0.02] text-muted-foreground text-xs uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3 text-left font-semibold">Property</th>
                <th className="px-5 py-3 text-left font-semibold">Area</th>
                <th className="px-5 py-3 text-right font-semibold">Base Rate</th>
                <th className="px-5 py-3 text-right font-semibold">Floor</th>
                <th className="px-5 py-3 text-right font-semibold">Ceiling</th>
                <th className="px-5 py-3 text-right font-semibold">Headroom</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border dark:divide-white/10">
              {listingRows.map((row) => {
                const headroom = row.ceiling > 0 ? row.ceiling - row.price : null;
                const headroomPct = headroom !== null && row.price > 0
                  ? ((headroom / row.price) * 100).toFixed(0)
                  : null;
                return (
                  <tr key={row.id} className="hover:bg-muted/30 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3 font-medium">{row.name}</td>
                    <td className="px-5 py-3 text-muted-foreground">{row.area}</td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums">
                      {row.currency} {row.price.toLocaleString("en-US")}
                    </td>
                    <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">
                      {row.floor > 0 ? `${row.currency} ${row.floor.toLocaleString("en-US")}` : "-"}
                    </td>
                    <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">
                      {row.ceiling > 0 ? `${row.currency} ${row.ceiling.toLocaleString("en-US")}` : "-"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {headroomPct !== null ? (
                        <span className={cn(
                          "inline-flex items-center gap-1 text-xs font-semibold",
                          Number(headroomPct) > 20 ? "text-emerald-500" : Number(headroomPct) > 5 ? "text-primary" : "text-red-400"
                        )}>
                          {Number(headroomPct) >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                          {headroomPct}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Approved proposals table */}
      {proposals.length > 0 && (
        <div className="rounded-xl border border-border dark:border-white/10 overflow-hidden">
          <div className="px-5 py-4 border-b border-border dark:border-white/10">
            <h2 className="text-sm font-semibold">Approved Revenue Proposals</h2>
            <p className="text-xs text-muted-foreground mt-0.5">AI-approved pricing actions</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 dark:bg-white/[0.02] text-muted-foreground text-xs uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3 text-left font-semibold">Date</th>
                <th className="px-5 py-3 text-right font-semibold">Current</th>
                <th className="px-5 py-3 text-right font-semibold">Proposed</th>
                <th className="px-5 py-3 text-right font-semibold">Change</th>
                <th className="px-5 py-3 text-left font-semibold hidden sm:table-cell">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border dark:divide-white/10">
              {(proposals as Record<string, unknown>[]).slice(0, 15).map((p, i) => {
                const current = Number(p.currentPrice ?? 0);
                const proposed = Number(p.proposedPrice ?? 0);
                const delta = proposed - current;
                const deltaPct = current > 0 ? ((delta / current) * 100).toFixed(1) : "0";
                return (
                  <tr key={String(p._id ?? i)} className="hover:bg-muted/30 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3 text-muted-foreground tabular-nums">
                      {String(p.targetDate ?? p.date ?? "-")}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {currency} {current.toLocaleString("en-US")}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums">
                      {currency} {proposed.toLocaleString("en-US")}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className={cn("font-semibold tabular-nums", delta >= 0 ? "text-emerald-500" : "text-red-400")}>
                        {delta >= 0 ? "+" : ""}{deltaPct}%
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-foreground hidden sm:table-cell max-w-[240px] truncate">
                      {String(p.reasoning ?? p.reason ?? "-")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground pb-4">
        Detailed revenue reporting, payouts, and expense tracking are available in your PMS (Hostaway).
      </p>
    </div>
  );
}

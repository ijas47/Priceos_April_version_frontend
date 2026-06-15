"use client";

import type { MarketPricingPack } from "@/lib/pricing/types";
import { cn } from "@/lib/utils";

interface SeasonalCalendarViewProps {
  pack: MarketPricingPack;
  calendarId: string;
  className?: string;
}

export function SeasonalCalendarView({ pack, calendarId, className }: SeasonalCalendarViewProps) {
  const calendar = pack.seasonalCalendars.find((c) => c.id === calendarId);

  if (!calendar) {
    return (
      <p className="text-xs text-muted-foreground py-4">No seasonal calendar found for this scope.</p>
    );
  }

  return (
    <div className={cn("rounded-xl border border-border/70 bg-card p-4 dark:border-white/10 overflow-x-auto", className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {calendar.name}
        </h3>
        <span className="text-[10px] text-muted-foreground">
          {calendar.segments.length} segments · repeats yearly (MM-DD)
        </span>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted-foreground border-b border-border/50">
            <th className="py-2 pr-4 font-medium">Season</th>
            <th className="py-2 pr-4 font-medium">Dates</th>
            <th className="py-2 pr-4 font-medium">Pricing profile</th>
            <th className="py-2 pr-4 font-medium">Minstay profile</th>
            <th className="py-2 font-medium">Base adj %</th>
          </tr>
        </thead>
        <tbody>
          {calendar.segments.map((seg) => (
            <tr key={seg.id} className="border-b border-border/30 last:border-0">
              <td className="py-2.5 pr-4 font-medium text-foreground">{seg.name}</td>
              <td className="py-2.5 pr-4 text-muted-foreground tabular-nums">
                {seg.startMd} → {seg.endMd}
              </td>
              <td className="py-2.5 pr-4">
                {pack.pricingProfiles.find((p) => p.id === seg.pricingProfileId)?.name ?? "—"}
              </td>
              <td className="py-2.5 pr-4">
                {pack.minStayProfiles.find((p) => p.id === seg.minStayProfileId)?.name ?? "—"}
              </td>
              <td className="py-2.5 tabular-nums">
                {seg.baseAdjPct != null
                  ? `${seg.baseAdjPct > 0 ? "+" : ""}${seg.baseAdjPct}%`
                  : seg.minAdjPct != null
                    ? `${seg.minAdjPct > 0 ? "+" : ""}${seg.minAdjPct}%`
                    : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Layers, ArrowRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface PortfolioStatus {
  strategy: string | null;
  marketCode: string | null;
  pricingPackVersion: string | null;
  guardrails: {
    maxSingleDayChangePct?: number;
    autoApproveThreshold?: number;
    absoluteFloorMultiplier?: number;
    absoluteCeilingMultiplier?: number;
  } | null;
}

interface PackSummary {
  version: string | null;
  profileNames: string[];
  calendarName: string | null;
}

export function PortfolioInheritanceBanner({ className }: { className?: string }) {
  const [status, setStatus] = useState<PortfolioStatus | null>(null);
  const [pack, setPack] = useState<PackSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const [setupRes, profilesRes] = await Promise.all([
          fetch("/api/pricing/portfolio-setup"),
          fetch("/api/pricing/profiles"),
        ]);
        if (disposed) return;
        if (setupRes.ok) {
          const data = await setupRes.json();
          setStatus({
            strategy: data.strategy ?? null,
            marketCode: data.marketCode ?? null,
            pricingPackVersion: data.pricingPackVersion ?? null,
            guardrails: data.guardrails ?? null,
          });
        }
        if (profilesRes.ok) {
          const data = await profilesRes.json();
          const p = data.pack;
          const calendarId = p?.portfolioDefaults?.defaultSeasonalCalendarId;
          const calendar = p?.seasonalCalendars?.find(
            (c: { id: string }) => c.id === calendarId
          );
          setPack({
            version: data.version ?? null,
            profileNames: (p?.pricingProfiles ?? []).map((x: { name: string }) => x.name),
            calendarName: calendar?.name ?? null,
          });
        }
      } finally {
        if (!disposed) setLoading(false);
      }
    })();
    return () => {
      disposed = true;
    };
  }, []);

  if (loading) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-4 py-3 text-xs text-muted-foreground",
          className
        )}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading portfolio defaults…
      </div>
    );
  }

  const strategyLabel = status?.strategy
    ? status.strategy.charAt(0).toUpperCase() + status.strategy.slice(1)
    : "Not set";

  return (
    <div
      className={cn(
        "rounded-lg border border-amber/25 bg-amber/5 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between",
        className
      )}
    >
      <div className="flex items-start gap-3 min-w-0">
        <Layers className="h-4 w-4 text-amber shrink-0 mt-0.5" />
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold text-foreground">
            Inherits portfolio defaults
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Property rules below override portfolio settings where configured. Portfolio
            profiles, seasonal calendar, and org guardrails are managed in Settings.
          </p>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            <Badge variant="secondary" className="text-[10px]">
              Strategy: {strategyLabel}
            </Badge>
            {status?.marketCode && (
              <Badge variant="outline" className="text-[10px]">
                {status.marketCode}
              </Badge>
            )}
            {(pack?.version || status?.pricingPackVersion) && (
              <Badge variant="outline" className="text-[10px]">
                Pack v{pack?.version || status?.pricingPackVersion}
              </Badge>
            )}
            {pack?.profileNames?.length ? (
              <Badge variant="outline" className="text-[10px]">
                {pack.profileNames.join(" · ")}
              </Badge>
            ) : null}
            {pack?.calendarName && (
              <Badge variant="outline" className="text-[10px]">
                {pack.calendarName}
              </Badge>
            )}
            {status?.guardrails?.maxSingleDayChangePct != null && (
              <Badge variant="outline" className="text-[10px]">
                Max Δ {status.guardrails.maxSingleDayChangePct}%/day
              </Badge>
            )}
          </div>
        </div>
      </div>
      <Link
        href="/settings?tab=pricing"
        className="inline-flex items-center gap-1.5 shrink-0 text-xs font-semibold text-amber hover:text-amber/80 transition-colors"
      >
        Edit portfolio defaults
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
"use client";

import { useCallback, useEffect, useState } from "react";
import { Layers, Shield, Loader2 } from "lucide-react";
import { PricingProfilesPanel } from "@/components/pricing/pricing-profiles-panel";
import { SmartPricingCard } from "@/components/settings/smart-pricing-card";
import { cn } from "@/lib/utils";
import { PricingTermHint } from "@/components/pricing/pricing-term-hint";

interface PortfolioStatus {
  totalProperties: number;
  configuredProperties: number;
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

export function PortfolioPricingSettings() {
  const [status, setStatus] = useState<PortfolioStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/pricing/portfolio-setup");
      if (!res.ok) return;
      const data = await res.json();
      setStatus(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const strategyLabel = status?.strategy
    ? status.strategy.charAt(0).toUpperCase() + status.strategy.slice(1)
    : "Not configured";

  return (
    <div className="flex flex-col gap-8">
      <div className="bg-surface-1 border border-border-subtle rounded-xl p-6 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-amber" />
          <h3 className="text-title font-semibold text-text-primary">Portfolio pricing defaults</h3>
        </div>
        <p className="text-body-xs text-text-tertiary max-w-3xl leading-relaxed">
          Organization-wide pricing profiles, seasonal calendar, and guardrails. Every property
          inherits these unless you override them under{" "}
          <span className="font-medium text-text-primary">Pricing → Rules</span> for a specific
          unit.
        </p>
      </div>

      <div className="bg-surface-1 border border-border-subtle rounded-xl p-6 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-amber" />
          <h3 className="text-sm font-semibold text-text-primary">Current portfolio policy</h3>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-text-tertiary py-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading…
          </div>
        ) : status ? (
          <div className="flex flex-wrap gap-2">
            <PolicyPill label="Strategy" value={strategyLabel} highlight />
            {status.marketCode && <PolicyPill label="Market" value={status.marketCode} />}
            {status.pricingPackVersion && (
              <PolicyPill label="Profile pack" value={`v${status.pricingPackVersion}`} />
            )}
            <PolicyPill
              label="Properties on policy"
              value={`${status.configuredProperties} / ${status.totalProperties}`}
            />
            {status.guardrails?.maxSingleDayChangePct != null && (
              <PolicyPill
                label="Max daily change"
                hint="maxDailyChange"
                value={`${status.guardrails.maxSingleDayChangePct}%`}
              />
            )}
            {status.guardrails?.autoApproveThreshold != null && (
              <PolicyPill
                label="Auto-approve under"
                hint="autoApprove"
                value={`${status.guardrails.autoApproveThreshold}%`}
              />
            )}
            {status.guardrails?.absoluteFloorMultiplier != null && (
              <PolicyPill
                label="Floor mult."
                hint="floorMult"
                value={`${status.guardrails.absoluteFloorMultiplier}×`}
              />
            )}
            {status.guardrails?.absoluteCeilingMultiplier != null && (
              <PolicyPill
                label="Ceiling mult."
                hint="ceilingMult"
                value={`${status.guardrails.absoluteCeilingMultiplier}×`}
              />
            )}
          </div>
        ) : (
          <p className="text-xs text-text-tertiary">Could not load portfolio status.</p>
        )}
      </div>

      <div className="bg-surface-1 border border-border-subtle rounded-xl p-6">
        <PricingProfilesPanel />
      </div>

      <SmartPricingCard onApplied={loadStatus} />
    </div>
  );
}

function PolicyPill({
  label,
  value,
  highlight,
  hint,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  hint?: "maxDailyChange" | "autoApprove" | "floorMult" | "ceilingMult";
}) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2",
        highlight
          ? "border-amber/30 bg-primary/10"
          : "border-border-subtle bg-surface-2/40"
      )}
    >
      <p className="text-[9px] uppercase tracking-wider text-text-tertiary flex items-center gap-1">
        {label}
        {hint && <PricingTermHint term={hint} />}
      </p>
      <p
        className={cn(
          "text-body-xs font-semibold",
          highlight ? "text-amber" : "text-text-primary"
        )}
      >
        {value}
      </p>
    </div>
  );
}
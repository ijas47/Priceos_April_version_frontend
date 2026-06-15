"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles, Loader2, Check, TrendingUp, Shield, Flame } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Strategy = "conservative" | "balanced" | "aggressive";

interface Status {
  totalProperties: number;
  configuredProperties: number;
  strategy: Strategy | null;
  marketCode: string | null;
}

interface SetupResult {
  totalConfigured: number;
  totalFailed: number;
  airbticsFed: boolean;
  engineRan: boolean;
  listings: { rulesCreated?: number }[];
}

const STRATEGY_OPTIONS: {
  mode: Strategy;
  label: string;
  blurb: string;
  icon: typeof Shield;
  recommended?: boolean;
}[] = [
  {
    mode: "conservative",
    label: "Conservative",
    blurb: "Tight floor/ceiling, small daily moves. Safest for nervous owners.",
    icon: Shield,
  },
  {
    mode: "balanced",
    label: "Balanced",
    blurb: "Wider range, seasonal + weekend uplift. Best for demos.",
    icon: TrendingUp,
    recommended: true,
  },
  {
    mode: "aggressive",
    label: "Aggressive",
    blurb: "Maximum range, bigger swings to chase peak demand.",
    icon: Flame,
  },
];

/**
 * Smart Pricing Setup — applies portfolio + property level pricing rules to ALL
 * existing properties in one click. Useful for properties connected before the
 * onboarding wizard, or to re-baseline the whole portfolio before a demo.
 *
 * Writes only to MongoDB; never pushes to Hostaway.
 */
export function SmartPricingCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [strategy, setStrategy] = useState<Strategy>("balanced");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SetupResult | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/pricing/portfolio-setup");
      if (!res.ok) return;
      const data: Status = await res.json();
      setStatus(data);
      if (data.strategy) setStrategy(data.strategy);
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleApply = useCallback(async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/pricing/portfolio-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error("Setup failed", { description: data?.error || "Please try again." });
        return;
      }
      setResult(data);
      const rules = (data.listings || []).reduce(
        (sum: number, l: { rulesCreated?: number }) => sum + (l.rulesCreated || 0),
        0,
      );
      toast.success("Smart pricing applied", {
        description: `${data.totalConfigured} properties configured · ${rules} rules created${
          data.airbticsFed ? " · market data used" : ""
        }.`,
        duration: 7000,
      });
      loadStatus();
    } catch (err) {
      toast.error("Setup failed", { description: (err as Error).message });
    } finally {
      setRunning(false);
    }
  }, [strategy, loadStatus]);

  const allConfigured =
    status && status.totalProperties > 0 && status.configuredProperties >= status.totalProperties;

  return (
    <div className="bg-surface-1 border border-border-subtle rounded-xl p-6 flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h3 className="text-title font-semibold text-text-primary flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber" />
          Smart Pricing Setup
        </h3>
        <p className="text-body-xs text-text-tertiary">
          Apply pricing guardrails, seasonal rules, and length-of-stay discounts to every property
          at once. Pulls live market data when available, then runs the pricing engine.
        </p>
      </div>

      {/* Current status */}
      {status && (
        <div className="flex flex-wrap gap-3">
          <StatPill label="Properties" value={String(status.totalProperties)} />
          <StatPill
            label="Configured"
            value={`${status.configuredProperties} / ${status.totalProperties}`}
            tone={allConfigured ? "good" : "muted"}
          />
          {status.strategy && (
            <StatPill label="Current strategy" value={cap(status.strategy)} tone="amber" />
          )}
          {status.marketCode && <StatPill label="Market" value={status.marketCode} />}
        </div>
      )}

      {/* Strategy picker */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {STRATEGY_OPTIONS.map((opt) => {
          const selected = strategy === opt.mode;
          const Icon = opt.icon;
          return (
            <button
              key={opt.mode}
              onClick={() => setStrategy(opt.mode)}
              disabled={running}
              className={cn(
                "text-left rounded-lg border p-4 transition-all disabled:opacity-60",
                selected
                  ? "border-amber bg-primary/dim"
                  : "border-border-subtle bg-surface-2/40 hover:border-border-default",
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <Icon className={cn("h-4 w-4", selected ? "text-amber" : "text-text-tertiary")} />
                {opt.recommended && (
                  <span className="text-[9px] font-bold uppercase tracking-wider text-amber">
                    Recommended
                  </span>
                )}
              </div>
              <p
                className={cn(
                  "text-body-xs font-semibold",
                  selected ? "text-amber" : "text-text-primary",
                )}
              >
                {opt.label}
              </p>
              <p className="text-[10px] text-text-tertiary leading-relaxed mt-1">{opt.blurb}</p>
            </button>
          );
        })}
      </div>

      {/* Safety note */}
      <div className="rounded-md border border-border-subtle bg-surface-2/30 p-2.5">
        <p className="text-[10px] text-text-tertiary leading-relaxed">
          Runs entirely on your data in PriceOS — generates proposals you can review. It does{" "}
          <span className="font-medium text-text-primary">not</span> push any prices to Hostaway.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleApply}
          disabled={running || (status?.totalProperties ?? 0) === 0}
          className="bg-amber hover:bg-amber/90 text-black font-bold h-10 px-6 rounded-md text-body-xs w-fit transition-all flex items-center gap-2 disabled:opacity-50"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {running
            ? "Applying…"
            : allConfigured
              ? "Re-apply to all properties"
              : "Apply to all properties"}
        </button>
        {(status?.totalProperties ?? 0) === 0 && (
          <p className="text-[11px] text-text-tertiary">
            Connect Hostaway and sync listings first.
          </p>
        )}
      </div>

      {/* Result summary */}
      {result && (
        <div className="rounded-lg border border-border-subtle bg-surface-2/40 p-4 flex flex-col gap-2 animate-in fade-in-50">
          <p className="text-body-xs font-semibold text-text-primary flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-400" />
            Done
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-text-secondary">
            <span>{result.totalConfigured} configured</span>
            {result.totalFailed > 0 && (
              <span className="text-rose-400">{result.totalFailed} failed</span>
            )}
            <span>
              {result.listings.reduce((s, l) => s + (l.rulesCreated || 0), 0)} pricing rules
            </span>
            <span>{result.airbticsFed ? "Market data applied" : "Template defaults applied"}</span>
            <span>{result.engineRan ? "Engine ran — proposals ready" : "Engine pending"}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function StatPill({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "good" | "muted" | "amber";
}) {
  return (
    <div className="rounded-md border border-border-subtle bg-surface-2/40 px-3 py-2">
      <p className="text-[9px] uppercase tracking-wider text-text-tertiary">{label}</p>
      <p
        className={cn(
          "text-body-xs font-semibold",
          tone === "good" && "text-emerald-400",
          tone === "amber" && "text-amber",
          tone === "muted" && "text-text-secondary",
          tone === "default" && "text-text-primary",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

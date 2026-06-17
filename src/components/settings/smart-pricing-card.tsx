"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  Loader2,
  Check,
  TrendingUp,
  Shield,
  Flame,
  ChevronDown,
  ChevronUp,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  STRATEGY_PRESETS,
  STRATEGY_PRESET_FIELDS,
  resolveStrategyPreset,
  type Strategy,
  type StrategyPreset,
} from "@/lib/pricing/strategy-presets";
import { PricingTermHint } from "@/components/pricing/pricing-term-hint";
import type { PricingGlossaryKey } from "@/lib/pricing/glossary";

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

const FIELD_GLOSSARY: Partial<Record<keyof StrategyPreset, PricingGlossaryKey>> = {
  floorMult: "floorMult",
  ceilingMult: "ceilingMult",
  maxSingleDayChangePct: "maxDailyChange",
  autoApproveThreshold: "autoApprove",
  lastMinuteDiscountPct: "lastMinute",
  lastMinuteDaysOut: "lm",
  farOutMarkupPct: "farOut",
  farOutDaysOut: "farOut",
  dowUpliftPct: "weekendUplift",
  gapFillDiscountPct: "gapFill",
};

export function SmartPricingCard({ onApplied }: { onApplied?: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [strategy, setStrategy] = useState<Strategy>("balanced");
  const [expanded, setExpanded] = useState<Strategy | null>("balanced");
  const [presetDraft, setPresetDraft] = useState<StrategyPreset>(STRATEGY_PRESETS.balanced);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SetupResult | null>(null);
  const cardRefs = useRef<Partial<Record<Strategy, HTMLDivElement | null>>>({});

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/pricing/portfolio-setup");
      if (!res.ok) return;
      const data: Status = await res.json();
      setStatus(data);
      if (data.strategy) {
        setStrategy(data.strategy);
        setExpanded(data.strategy);
        setPresetDraft(STRATEGY_PRESETS[data.strategy]);
      }
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const selectStrategy = useCallback((mode: Strategy) => {
    const opening = expanded !== mode;
    setStrategy(mode);
    setPresetDraft(STRATEGY_PRESETS[mode]);
    setExpanded(opening ? mode : null);

    requestAnimationFrame(() => {
      cardRefs.current[mode]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, [expanded]);

  const presetOverrides = useMemo((): Partial<StrategyPreset> | undefined => {
    const base = STRATEGY_PRESETS[strategy];
    const overrides: Partial<StrategyPreset> = {};
    (Object.keys(base) as (keyof StrategyPreset)[]).forEach((key) => {
      if (presetDraft[key] !== base[key]) {
        overrides[key] = presetDraft[key];
      }
    });
    return Object.keys(overrides).length > 0 ? overrides : undefined;
  }, [strategy, presetDraft]);

  const hasCustomPreset = !!presetOverrides;
  const isDraft = status?.strategy != null && status.strategy !== strategy;

  const resetPresetToDefault = useCallback(() => {
    setPresetDraft(STRATEGY_PRESETS[strategy]);
  }, [strategy]);

  const updatePresetField = useCallback((key: keyof StrategyPreset, raw: string) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    setPresetDraft((prev) => ({ ...prev, [key]: parsed }));
  }, []);

  const handleApply = useCallback(async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/pricing/portfolio-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy, presetOverrides }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error("Setup failed", { description: data?.error || "Please try again." });
        return;
      }
      setResult(data);
      const rules = (data.listings || []).reduce(
        (sum: number, l: { rulesCreated?: number }) => sum + (l.rulesCreated || 0),
        0
      );
      toast.success("Smart pricing applied", {
        description: `${data.totalConfigured} properties configured · ${rules} rules created${
          data.airbticsFed ? " · market data used" : ""
        }.`,
        duration: 7000,
      });
      loadStatus();
      onApplied?.();
    } catch (err) {
      toast.error("Setup failed", { description: (err as Error).message });
    } finally {
      setRunning(false);
    }
  }, [strategy, presetOverrides, loadStatus, onApplied]);

  const allConfigured =
    status && status.totalProperties > 0 && status.configuredProperties >= status.totalProperties;

  const resolved = resolveStrategyPreset(strategy, presetOverrides);

  return (
    <div className="bg-surface-1 border border-border-subtle rounded-xl p-6 flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h3 className="text-title font-semibold text-text-primary flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber" />
          Bulk property setup
          <PricingTermHint term="strategyVsProfiles" />
        </h3>
        <p className="text-body-xs text-text-tertiary">
          Push the portfolio policy above onto every property: org guardrails, profile pack,
          per-unit floor/ceiling from market data, seasonal + LOS rules, then run the pricing
          engine. Use after syncing new listings or changing strategy. For seasonal LM, occupancy,
          and MLOS matrices, edit Portfolio Profiles above.
        </p>
        <p className="text-[10px] text-text-tertiary mt-1">
          Click a strategy to expand its settings. Changes apply only after you press{" "}
          <span className="font-medium text-text-primary">Apply to all properties</span>.
        </p>
      </div>

      {status && (
        <div className="flex flex-wrap gap-3">
          <StatPill label="Properties" value={String(status.totalProperties)} />
          <StatPill
            label="Configured"
            value={`${status.configuredProperties} / ${status.totalProperties}`}
            tone={allConfigured ? "good" : "muted"}
          />
          {status.strategy && (
            <StatPill label="Active strategy" value={cap(status.strategy)} tone="amber" />
          )}
          {isDraft && (
            <StatPill label="Draft selection" value={cap(strategy)} tone="muted" />
          )}
          {status.marketCode && <StatPill label="Market" value={status.marketCode} />}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {STRATEGY_OPTIONS.map((opt) => {
          const selected = strategy === opt.mode;
          const isOpen = expanded === opt.mode;
          const isActive = status?.strategy === opt.mode;
          const Icon = opt.icon;
          const preview = resolveStrategyPreset(
            opt.mode,
            selected ? presetOverrides : undefined
          );

          return (
            <div
              key={opt.mode}
              ref={(el) => {
                cardRefs.current[opt.mode] = el;
              }}
              className={cn(
                "rounded-lg border transition-all",
                selected
                  ? "border-amber ring-2 ring-amber/50 shadow-[0_0_0_1px_rgba(251,191,36,0.15)]"
                  : "border-border-subtle bg-surface-2/40"
              )}
            >
              <button
                type="button"
                onClick={() => selectStrategy(opt.mode)}
                disabled={running}
                className={cn(
                  "w-full text-left p-4 transition-all disabled:opacity-60",
                  selected ? "bg-primary/15" : "hover:bg-surface-2/60"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={cn(
                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
                        selected
                          ? "border-amber bg-amber/20 text-amber"
                          : "border-border-subtle bg-surface-2 text-text-tertiary"
                      )}
                    >
                      {selected ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p
                          className={cn(
                            "text-body-xs font-semibold",
                            selected ? "text-amber" : "text-text-primary"
                          )}
                        >
                          {opt.label}
                        </p>
                        {opt.recommended && (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-amber">
                            Recommended
                          </span>
                        )}
                        {isActive && (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400">
                            Active
                          </span>
                        )}
                        {selected && isDraft && (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-text-tertiary">
                            Draft
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-text-tertiary leading-relaxed mt-1">
                        {opt.blurb}
                      </p>
                      <p className="text-[10px] text-text-secondary mt-2">
                        Floor {preview.floorMult}× · ceiling {preview.ceilingMult}× · max daily{" "}
                        {preview.maxSingleDayChangePct}%
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-text-tertiary">
                    {isOpen ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-border-subtle px-4 pb-4 pt-3 space-y-4 animate-in fade-in-50 slide-in-from-top-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] text-text-tertiary">
                      Org guardrails and property defaults for{" "}
                      <span className="font-medium text-text-primary">{opt.label}</span>.
                    </p>
                    <div className="flex items-center gap-2">
                      {hasCustomPreset && selected && (
                        <span className="text-[10px] text-amber font-medium">Customized</span>
                      )}
                      {selected && (
                        <button
                          type="button"
                          onClick={resetPresetToDefault}
                          disabled={running || !hasCustomPreset}
                          className="inline-flex items-center gap-1 text-[10px] text-text-tertiary hover:text-text-primary disabled:opacity-40"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Reset preset
                        </button>
                      )}
                    </div>
                  </div>

                  {selected ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {STRATEGY_PRESET_FIELDS.map((field) => {
                        const glossaryKey = FIELD_GLOSSARY[field.key];
                        const value = presetDraft[field.key];
                        const defaultVal = STRATEGY_PRESETS[strategy][field.key];
                        const isCustom = value !== defaultVal;
                        return (
                          <div key={field.key} className="space-y-1">
                            <Label className="text-[10px] text-text-tertiary flex items-center gap-1">
                              {field.label}
                              {glossaryKey && <PricingTermHint term={glossaryKey} />}
                              {isCustom && (
                                <span className="text-amber text-[9px] font-medium">edited</span>
                              )}
                            </Label>
                            <div className="flex items-center gap-1.5">
                              <Input
                                type="number"
                                step={field.step ?? 1}
                                min={field.min}
                                max={field.max}
                                value={value}
                                disabled={running}
                                onChange={(e) => updatePresetField(field.key, e.target.value)}
                                className="h-8 text-xs"
                              />
                              <span className="text-[10px] text-text-tertiary w-8 shrink-0">
                                {field.unit}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[10px] text-text-tertiary">
                      Select this card to edit {opt.label.toLowerCase()} values before applying.
                    </p>
                  )}

                  {selected && (
                    <p className="text-[10px] text-text-tertiary border-t border-border-subtle pt-3">
                      Preview envelope: floor {resolved.floorMult}× base · ceiling{" "}
                      {resolved.ceilingMult}× base · auto-approve under{" "}
                      {resolved.autoApproveThreshold}% · max daily move{" "}
                      {resolved.maxSingleDayChangePct}%.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-md border border-border-subtle bg-surface-2/30 p-2.5">
        <p className="text-[10px] text-text-tertiary leading-relaxed">
          Runs entirely on your data in PriceOS. It generates proposals you can review. It does{" "}
          <span className="font-medium text-text-primary">not</span> push any prices to Hostaway.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={handleApply}
          disabled={running || (status?.totalProperties ?? 0) === 0}
          className="bg-amber hover:bg-amber/90 text-black font-bold h-10 px-6 rounded-md text-body-xs w-fit transition-all flex items-center gap-2 disabled:opacity-50"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {running ? "Applying…" : `Apply ${cap(strategy)} to all properties`}
        </button>
        {(status?.totalProperties ?? 0) === 0 && (
          <p className="text-[11px] text-text-tertiary">
            Connect Hostaway and sync listings first.
          </p>
        )}
        {isDraft && (status?.totalProperties ?? 0) > 0 && (
          <p className="text-[11px] text-amber">
            {cap(strategy)} selected but not active yet. Press Apply to save.
          </p>
        )}
      </div>

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
            <span>{result.engineRan ? "Engine ran, proposals ready" : "Engine pending"}</span>
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
          tone === "default" && "text-text-primary"
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
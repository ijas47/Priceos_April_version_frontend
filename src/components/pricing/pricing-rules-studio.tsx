"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Shield,
  Sun,
  Clock,
  Layers,
  TrendingDown,
  AlignLeft,
  Plus,
  Trash2,
  Loader2,
  Save,
  Info,
  CheckCircle2,
  Activity,
  CalendarRange,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { OccupancyMatrixEditor } from "./occupancy-matrix-editor";
import { MinStayProfileEditor } from "./minstay-profile-editor";
import { PortfolioInheritanceBanner } from "./portfolio-inheritance-banner";
import { SeasonalCalendarView } from "./seasonal-calendar-view";
import type {
  OccupancyMatrix,
  MinStayProfile,
  PricingProfile,
  MarketPricingPack,
  SeasonalSegment,
} from "@/lib/pricing/types";

/** @deprecated Portfolio defaults live in Settings → Pricing; property rules only here. */
export const PORTFOLIO_SCOPE_ID = "__portfolio__";

function resolveSeasonForDate(pack: MarketPricingPack, date = new Date()) {
  const calendarId = pack.portfolioDefaults.defaultSeasonalCalendarId;
  const calendar = pack.seasonalCalendars.find((c) => c.id === calendarId);
  if (!calendar) {
    return { segment: null as SeasonalSegment | null, profile: pack.pricingProfiles[0] ?? null };
  }
  const md = `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const segment =
    calendar.segments.find((s) => {
      if (s.startMd <= s.endMd) return md >= s.startMd && md <= s.endMd;
      return md >= s.startMd || md <= s.endMd;
    }) ?? null;
  const profileId = segment?.pricingProfileId;
  const profile = pack.pricingProfiles.find((p) => p.id === profileId) ?? pack.pricingProfiles[0] ?? null;
  return { segment, profile };
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Listing {
  id: string;
  name: string;
  currencyCode?: string;
}

interface EngineConfig {
  priceFloor: number;
  priceCeiling: number;
  lowestMinStayAllowed: number;
  defaultMaxStay: number;
  // Weekend minimum pricing (KB Tier 2 #8)
  weekendMinPrice: number;
  weekendDays: number[];
  lastMinuteEnabled: boolean;
  lastMinuteDaysOut: number;
  lastMinuteDiscountPct: number;
  lastMinuteMinStay: number | null;
  // Gradual last-minute ramp curve (KB Tier 1 #3)
  lastMinuteRampEnabled: boolean;
  lastMinuteRampDays: number;
  lastMinuteMaxDiscountPct: number;
  lastMinuteMinDiscountPct: number;
  farOutEnabled: boolean;
  farOutDaysOut: number;
  farOutMarkupPct: number;
  farOutMinStay: number | null;
  farOutMinPrice: number;
  dowPricingEnabled: boolean;
  dowDays: number[];
  dowPriceAdjPct: number;
  dowMinStay: number | null;
  gapPreventionEnabled: boolean;
  minFragmentThreshold: number;
  gapFillEnabled: boolean;
  gapFillLengthMin: number;
  gapFillLengthMax: number;
  gapFillDiscountPct: number;
  gapFillDiscountWeekdayPct: number;
  gapFillDiscountWeekendPct: number;
  gapFillMaxDaysUntilCheckin: number;
  gapFillOverrideCico: boolean;
  adjacentAdjustmentEnabled: boolean;
  adjacentAdjustmentPct: number;
  adjacentTurnoverCost: number;
  allowedCheckinDays: number[];
  allowedCheckoutDays: number[];
  // Occupancy-based adjustments (KB Tier 1 #4 — Revenue 9/10)
  occupancyEnabled: boolean;
  occupancyTargetPct: number;
  occupancyHighThresholdPct: number;
  occupancyHighAdjPct: number;
  occupancyLowThresholdPct: number;
  occupancyLowAdjPct: number;
  occupancyLookbackDays: number;
  occupancyMatrix?: {
    dayRanges: { startDay: number; endDay: number; label?: string }[];
    rows: { maxOccupancyPct: number; adjustmentsPct: number[] }[];
  };
  occupancyPreset?: string;
  occupancyWindowProfiles: {
    startDay: number;
    endDay: number;
    highThresholdPct: number;
    highAdjPct: number;
    lowThresholdPct: number;
    lowAdjPct: number;
  }[];
  useGroupOccupancyProfile: boolean;
  groupOccupancyWeightPct: number;
  groupOccupancyProfiles: {
    startDay: number;
    endDay: number;
    occupancyPct: number;
    sampleSize: number;
    groupIds: string[];
  }[];
  basePriceSource: "history_1y" | "benchmark" | "hostaway";
  basePriceConfidencePct: number;
  basePriceSampleSize: number;
  basePriceLastComputedAt: string | null;
  usePortfolioPricingDefaults?: boolean;
  pricingProfileOverrideId?: string | null;
  seasonalCalendarOverrideId?: string | null;
  minStayProfileOverrideId?: string | null;
}

interface PricingRule {
  _id: string;
  ruleType: "SEASON" | "EVENT" | "ADMIN_BLOCK" | "LOS_DISCOUNT";
  name: string;
  enabled: boolean;
  priority: number;
  startDate?: string;
  endDate?: string;
  daysOfWeek?: number[];
  minNights?: number;
  priceOverride?: number;
  priceAdjPct?: number;
  minStayOverride?: number;
  isBlocked?: boolean;
  closedToArrival?: boolean;
  closedToDeparture?: boolean;
  suspendLastMinute?: boolean;
  suspendGapFill?: boolean;
}

const DEFAULT_CONFIG: EngineConfig = {
  priceFloor: 0,
  priceCeiling: 0,
  lowestMinStayAllowed: 1,
  defaultMaxStay: 30,
  weekendMinPrice: 0,
  weekendDays: [4, 5],
  lastMinuteEnabled: false,
  lastMinuteDaysOut: 7,
  lastMinuteDiscountPct: 15,
  lastMinuteMinStay: null,
  lastMinuteRampEnabled: false,
  lastMinuteRampDays: 15,
  lastMinuteMaxDiscountPct: 30,
  lastMinuteMinDiscountPct: 5,
  farOutEnabled: false,
  farOutDaysOut: 90,
  farOutMarkupPct: 10,
  farOutMinStay: null,
  farOutMinPrice: 0,
  dowPricingEnabled: false,
  dowDays: [4, 5],
  dowPriceAdjPct: 15,
  dowMinStay: null,
  gapPreventionEnabled: true,
  minFragmentThreshold: 3,
  gapFillEnabled: false,
  gapFillLengthMin: 1,
  gapFillLengthMax: 4,
  gapFillDiscountPct: 10,
  gapFillDiscountWeekdayPct: 0,
  gapFillDiscountWeekendPct: 0,
  gapFillMaxDaysUntilCheckin: 30,
  gapFillOverrideCico: false,
  adjacentAdjustmentEnabled: false,
  adjacentAdjustmentPct: 0,
  adjacentTurnoverCost: 0,
  allowedCheckinDays: [1, 1, 1, 1, 1, 1, 1],
  allowedCheckoutDays: [1, 1, 1, 1, 1, 1, 1],
  occupancyEnabled: false,
  occupancyTargetPct: 75,
  occupancyHighThresholdPct: 85,
  occupancyHighAdjPct: 15,
  occupancyLowThresholdPct: 50,
  occupancyLowAdjPct: -10,
  occupancyLookbackDays: 30,
  occupancyWindowProfiles: [],
  useGroupOccupancyProfile: true,
  groupOccupancyWeightPct: 50,
  groupOccupancyProfiles: [],
  basePriceSource: "hostaway",
  basePriceConfidencePct: 0,
  basePriceSampleSize: 0,
  basePriceLastComputedAt: null,
};

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function isPersistedListingId(listingId: string) {
  return /^[a-f0-9]{24}$/i.test(listingId);
}

async function patchConfig(listingId: string, patch: Partial<EngineConfig>) {
  if (!isPersistedListingId(listingId)) return;
  const res = await fetch(`/api/listings/${listingId}/engine-config`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error("Failed to save");
}

async function createRule(listingId: string, rule: Omit<PricingRule, "_id">) {
  if (!isPersistedListingId(listingId)) {
    return { ...rule, _id: `demo-rule-${Date.now()}` };
  }
  const res = await fetch(`/api/listings/${listingId}/rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rule),
  });
  if (!res.ok) throw new Error("Failed to create rule");
  return res.json();
}

async function toggleRule(listingId: string, ruleId: string, enabled: boolean) {
  if (!isPersistedListingId(listingId) || ruleId.startsWith("demo-rule-")) return;
  const res = await fetch(`/api/listings/${listingId}/rules/${ruleId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error("Failed to update rule");
}

async function deleteRule(listingId: string, ruleId: string) {
  if (!isPersistedListingId(listingId) || ruleId.startsWith("demo-rule-")) return;
  const res = await fetch(`/api/listings/${listingId}/rules/${ruleId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete rule");
}

// ── Guardrails Tab ────────────────────────────────────────────────────────────

function GuardrailsTab({
  listingId,
  config,
  onConfigChange,
  currency = "AED",
}: {
  listingId: string;
  config: EngineConfig;
  onConfigChange: (patch: Partial<EngineConfig>) => void;
  currency?: string;
}) {
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await patchConfig(listingId, {
        priceFloor: config.priceFloor,
        priceCeiling: config.priceCeiling,
        lowestMinStayAllowed: config.lowestMinStayAllowed,
        defaultMaxStay: config.defaultMaxStay,
        allowedCheckinDays: config.allowedCheckinDays,
        allowedCheckoutDays: config.allowedCheckoutDays,
        weekendMinPrice: config.weekendMinPrice,
        weekendDays: config.weekendDays,
      });
      toast.success("Guardrails saved to database.");
    } catch {
      toast.error("Failed to save guardrails.");
    } finally {
      setSaving(false);
    }
  };

  const toggleWeekendDay = (i: number) => {
    const current = config.weekendDays ?? [];
    const next = current.includes(i) ? current.filter((d) => d !== i) : [...current, i];
    onConfigChange({ weekendDays: next });
  };

  return (
    <div className="space-y-6">
      <p className="text-xs text-text-tertiary">
        Hard boundaries enforced at Pass 4 of the waterfall. Nothing overrides these.
      </p>

      {/* Price Boundaries */}
      <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4 space-y-4">
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Price Boundaries</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-text-tertiary mb-1.5 block">Floor Price ({currency})</Label>
            <Input
              type="number"
              value={config.priceFloor || ""}
              onChange={(e) => onConfigChange({ priceFloor: Number(e.target.value) })}
              placeholder="e.g. 300"
              className="h-9 bg-white/5 border-white/10 text-sm"
            />
            <p className="text-[10px] text-muted-foreground/80 mt-1">Minimum price — engine never goes below this</p>
          </div>
          <div>
            <Label className="text-xs text-text-tertiary mb-1.5 block">Ceiling Price ({currency})</Label>
            <Input
              type="number"
              value={config.priceCeiling || ""}
              onChange={(e) => onConfigChange({ priceCeiling: Number(e.target.value) })}
              placeholder="e.g. 3000"
              className="h-9 bg-white/5 border-white/10 text-sm"
            />
            <p className="text-[10px] text-muted-foreground/80 mt-1">Maximum price — engine never exceeds this</p>
          </div>
        </div>
      </div>

      {/* Stay Limits */}
      <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4 space-y-4">
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Stay Limits</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-text-tertiary mb-1.5 block">Absolute Min Stay (nights)</Label>
            <Input
              type="number"
              min={1}
              value={config.lowestMinStayAllowed || ""}
              onChange={(e) => onConfigChange({ lowestMinStayAllowed: Number(e.target.value) })}
              className="h-9 bg-white/5 border-white/10 text-sm"
            />
            <p className="text-[10px] text-muted-foreground/80 mt-1">Gap rules can never lower min stay below this</p>
          </div>
          <div>
            <Label className="text-xs text-text-tertiary mb-1.5 block">Default Max Stay (nights)</Label>
            <Input
              type="number"
              min={1}
              value={config.defaultMaxStay || ""}
              onChange={(e) => onConfigChange({ defaultMaxStay: Number(e.target.value) })}
              className="h-9 bg-white/5 border-white/10 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Check-in / Check-out Days */}
      <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4 space-y-4">
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Allowed Check-in / Check-out Days</h3>
        <p className="text-[11px] text-text-tertiary">Toggle which days of the week guests can check in or check out.</p>
        <div className="space-y-3">
          {(["Check-in", "Check-out"] as const).map((label) => {
            const key = label === "Check-in" ? "allowedCheckinDays" : "allowedCheckoutDays";
            const days = config[key] ?? [1, 1, 1, 1, 1, 1, 1];
            return (
              <div key={label}>
                <p className="text-xs text-text-tertiary mb-2">{label}</p>
                <div className="flex gap-2 flex-wrap">
                  {DOW_LABELS.map((day, i) => (
                    <button
                      key={day}
                      onClick={() => {
                        const next = [...days];
                        next[i] = next[i] === 1 ? 0 : 1;
                        onConfigChange({ [key]: next });
                      }}
                      className={cn(
                        "text-xs px-3 py-1.5 rounded-full border transition-colors",
                        days[i] === 1
                          ? "bg-amber/10 border-amber/30 text-amber"
                          : "border-border/70 text-muted-foreground hover:border-border dark:border-white/15 dark:hover:border-white/25"
                      )}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Weekend Minimum Pricing — KB Tier 2 #8 */}
      <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4 space-y-4">
        <div>
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Weekend Minimum Price</h3>
          <p className="text-[11px] text-text-tertiary mt-0.5">KB Tier 2 #8 — Floor price applied only on selected weekend nights (e.g. Thu/Fri)</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-text-tertiary mb-1.5 block">Weekend Floor Price ({currency})</Label>
            <Input
              type="number"
              min={0}
              value={config.weekendMinPrice || ""}
              onChange={(e) => onConfigChange({ weekendMinPrice: Number(e.target.value) })}
              placeholder="e.g. 600"
              className="h-9 bg-white/5 border-white/10 text-sm"
            />
            <p className="text-[10px] text-muted-foreground/80 mt-1">Set 0 to disable weekend minimum</p>
          </div>
          <div>
            <Label className="text-xs text-text-tertiary mb-2 block">Weekend Days</Label>
            <div className="flex gap-2 flex-wrap">
              {DOW_LABELS.map((day, i) => (
                <button
                  key={day}
                  onClick={() => toggleWeekendDay(i)}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-full border transition-colors",
                    (config.weekendDays ?? []).includes(i)
                      ? "bg-amber/10 border-amber/30 text-amber"
                      : "border-border/70 text-muted-foreground hover:border-border dark:border-white/15 dark:hover:border-white/25"
                  )}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Button
        size="sm"
        onClick={handleSave}
        disabled={saving}
        className="bg-amber text-black hover:bg-amber/90 h-9 text-xs gap-2"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        Save Guardrails
      </Button>
    </div>
  );
}

// ── Seasons Tab (portfolio seasonal calendar) ─────────────────────────────────

function SeasonsTab({
  listingId,
  config,
  onConfigChange,
  rules,
  onRulesChange,
}: {
  listingId: string;
  config: EngineConfig;
  onConfigChange: (patch: Partial<EngineConfig>) => void;
  rules: PricingRule[];
  onRulesChange: () => void;
}) {
  const [pack, setPack] = useState<MarketPricingPack | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showLegacy, setShowLegacy] = useState(false);

  const inheritPortfolio = !config.seasonalCalendarOverrideId;
  const legacySeasonRules = rules.filter(
    (r) => r.ruleType === "SEASON" && !r.name.startsWith("[UAE]")
  );

  useEffect(() => {
    fetch("/api/pricing/profiles")
      .then((r) => r.json())
      .then((d) => setPack(d.pack ?? null))
      .catch(() => {});
  }, []);

  const activeCalendarId =
    config.seasonalCalendarOverrideId ??
    pack?.portfolioDefaults.defaultSeasonalCalendarId ??
    "";
  const activeCalendar = pack?.seasonalCalendars.find((c) => c.id === activeCalendarId);

  const handleSave = async () => {
    setSaving(true);
    try {
      await patchConfig(listingId, {
        seasonalCalendarOverrideId: inheritPortfolio ? null : config.seasonalCalendarOverrideId,
        usePortfolioPricingDefaults: config.usePortfolioPricingDefaults,
      });
      toast.success("Seasonal calendar settings saved.");
    } catch {
      toast.error("Failed to save seasonal calendar settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleLegacy = async (rule: PricingRule) => {
    try {
      await toggleRule(listingId, rule._id, !rule.enabled);
      toast.success(`"${rule.name}" ${!rule.enabled ? "enabled" : "disabled"}.`);
      onRulesChange();
    } catch {
      toast.error("Failed to update rule.");
    }
  };

  const handleDeleteLegacy = async (rule: PricingRule) => {
    setDeletingId(rule._id);
    try {
      await deleteRule(listingId, rule._id);
      toast.success(`Season rule "${rule.name}" deleted.`);
      onRulesChange();
    } catch {
      toast.error("Failed to delete rule.");
    } finally {
      setDeletingId(null);
    }
  };

  if (!pack) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading seasonal calendar…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 text-xs bg-amber/5 border border-amber/20 rounded-lg p-3">
        <Info className="h-3.5 w-3.5 mt-0.5 text-amber shrink-0" />
        <span className="text-text-secondary">
          Seasons use your portfolio <span className="font-semibold text-foreground">seasonal calendar</span>:
          each date range maps to a pricing profile (High / Low / Shoulder) and a minimum-stay profile.
          One-off events belong in <span className="font-semibold text-foreground">Date Overrides</span>.
        </span>
      </div>

      <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Scope</h3>
            <p className="text-[11px] text-text-tertiary mt-0.5">
              {inheritPortfolio
                ? "Using portfolio seasonal calendar (group overrides still apply in the engine)."
                : "This unit uses a different seasonal calendar from the portfolio pack."}
            </p>
          </div>
          <Switch
            checked={inheritPortfolio}
            onCheckedChange={(v) => {
              if (v) {
                onConfigChange({ seasonalCalendarOverrideId: null });
              } else {
                onConfigChange({
                  seasonalCalendarOverrideId:
                    config.seasonalCalendarOverrideId ??
                    pack.portfolioDefaults.defaultSeasonalCalendarId,
                });
              }
            }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">
          {inheritPortfolio ? "Inheriting portfolio defaults" : "Unit calendar override active"}
        </p>
      </div>

      {!inheritPortfolio && pack.seasonalCalendars.length > 1 && (
        <div className="space-y-2">
          <Label className="text-xs">Unit seasonal calendar</Label>
          <Select
            value={config.seasonalCalendarOverrideId ?? undefined}
            onValueChange={(id) => onConfigChange({ seasonalCalendarOverrideId: id })}
          >
            <SelectTrigger className="h-8 text-xs max-w-sm">
              <SelectValue placeholder="Select calendar" />
            </SelectTrigger>
            <SelectContent>
              {pack.seasonalCalendars.map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-xs">
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {activeCalendar && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">{activeCalendar.name}</Badge>
            {inheritPortfolio && (
              <Badge variant="outline" className="text-[10px]">Inherited</Badge>
            )}
          </div>
          <SeasonalCalendarView pack={pack} calendarId={activeCalendarId} />
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">
        To edit segment dates, pricing profile mapping, or base adjustments, choose{" "}
        <span className="font-medium text-foreground">Portfolio defaults</span> in the header dropdown.
      </p>

      <Button
        size="sm"
        onClick={handleSave}
        disabled={saving}
        className="bg-amber text-black hover:bg-amber/90 h-9 text-xs gap-2"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        Save Seasonal Calendar
      </Button>

      {legacySeasonRules.length > 0 && (
        <div className="rounded-lg border border-dashed border-white/10">
          <button
            type="button"
            onClick={() => setShowLegacy((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Legacy custom season rules ({legacySeasonRules.length})
            <span className="text-[10px]">{showLegacy ? "Hide" : "Show"}</span>
          </button>
          {showLegacy && (
            <div className="px-4 pb-4 space-y-2 border-t border-white/5">
              <p className="text-[10px] text-muted-foreground pt-3">
                Older per-date SEASON rules. Prefer the seasonal calendar above; use Date Overrides for events.
              </p>
              {legacySeasonRules.map((rule) => (
                <div
                  key={rule._id}
                  className="rounded-lg border border-white/5 bg-white/[0.02] p-3 flex items-center gap-3 flex-wrap"
                >
                  <Switch checked={rule.enabled} onCheckedChange={() => handleToggleLegacy(rule)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{rule.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {rule.startDate} → {rule.endDate}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {(rule.priceAdjPct ?? 0) > 0 ? "+" : ""}
                    {rule.priceAdjPct ?? 0}%
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={deletingId === rule._id}
                    onClick={() => handleDeleteLegacy(rule)}
                    className="h-7 w-7"
                  >
                    {deletingId === rule._id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Lead Time Tab (DOW + Last-Minute + Far-Out) ───────────────────────────────

function LeadTimeTab({
  listingId,
  config,
  onConfigChange,
}: {
  listingId: string;
  config: EngineConfig;
  onConfigChange: (patch: Partial<EngineConfig>) => void;
}) {
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await patchConfig(listingId, {
        dowPricingEnabled: config.dowPricingEnabled,
        dowDays: config.dowDays,
        dowPriceAdjPct: config.dowPriceAdjPct,
        dowMinStay: config.dowMinStay,
        lastMinuteEnabled: config.lastMinuteEnabled,
        lastMinuteDaysOut: config.lastMinuteDaysOut,
        lastMinuteDiscountPct: config.lastMinuteDiscountPct,
        lastMinuteMinStay: config.lastMinuteMinStay,
        lastMinuteRampEnabled: config.lastMinuteRampEnabled,
        lastMinuteRampDays: config.lastMinuteRampDays,
        lastMinuteMaxDiscountPct: config.lastMinuteMaxDiscountPct,
        lastMinuteMinDiscountPct: config.lastMinuteMinDiscountPct,
        farOutEnabled: config.farOutEnabled,
        farOutDaysOut: config.farOutDaysOut,
        farOutMarkupPct: config.farOutMarkupPct,
        farOutMinStay: config.farOutMinStay,
        farOutMinPrice: config.farOutMinPrice,
      });
      toast.success("Lead time rules saved to database.");
    } catch {
      toast.error("Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const toggleDowDay = (i: number) => {
    const current = config.dowDays ?? [];
    const next = current.includes(i) ? current.filter((d) => d !== i) : [...current, i];
    onConfigChange({ dowDays: next });
  };

  return (
    <div className="space-y-6">
      {/* Day of Week */}
      <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Day-of-Week Premium</h3>
            <p className="text-[11px] text-text-tertiary mt-0.5">Apply a markup on selected days (e.g. Fri/Sat weekends)</p>
          </div>
          <Switch
            checked={config.dowPricingEnabled}
            onCheckedChange={(v) => onConfigChange({ dowPricingEnabled: v })}
          />
        </div>
        {config.dowPricingEnabled && (
          <div className="space-y-4">
            <div>
              <p className="text-xs text-text-tertiary mb-2">Premium Days</p>
              <div className="flex gap-2 flex-wrap">
                {DOW_LABELS.map((day, i) => (
                  <button
                    key={day}
                    onClick={() => toggleDowDay(i)}
                    className={cn(
                      "text-xs px-3 py-1.5 rounded-full border transition-colors",
                      (config.dowDays ?? []).includes(i)
                        ? "bg-amber/10 border-amber/30 text-amber"
                        : "border-border/70 text-muted-foreground hover:border-border dark:border-white/15 dark:hover:border-white/25"
                    )}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-text-tertiary mb-1 block">
                  Markup: <span className="font-bold text-green-400">+{config.dowPriceAdjPct}%</span>
                </Label>
                <Slider
                  min={0} max={50} step={5}
                  value={[config.dowPriceAdjPct]}
                  onValueChange={([v]) => onConfigChange({ dowPriceAdjPct: v })}
                />
              </div>
              <div>
                <Label className="text-xs text-text-tertiary mb-1.5 block">Min Stay Override</Label>
                <Input
                  type="number" min={1}
                  value={config.dowMinStay ?? ""}
                  onChange={(e) => onConfigChange({ dowMinStay: e.target.value ? Number(e.target.value) : null })}
                  placeholder="none"
                  className="h-8 text-sm bg-white/5 border-white/10"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Last-Minute */}
      <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Last-Minute Discount</h3>
            <p className="text-[11px] text-text-tertiary mt-0.5">Discount for bookings within X days of check-in</p>
          </div>
          <Switch
            checked={config.lastMinuteEnabled}
            onCheckedChange={(v) => onConfigChange({ lastMinuteEnabled: v })}
          />
        </div>
        {config.lastMinuteEnabled && (
          <div className="space-y-4">
            {/* Mode toggle: flat vs gradual ramp */}
            <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
              <Switch
                checked={config.lastMinuteRampEnabled}
                onCheckedChange={(v) => onConfigChange({ lastMinuteRampEnabled: v })}
              />
              <span>
                <span className="font-medium">Gradual Ramp Curve</span>
                <span className="text-muted-foreground/80 ml-1">(KB Tier 1 #3 — tapers from max% at day 1 to min% at day N)</span>
              </span>
            </label>

            {config.lastMinuteRampEnabled ? (
              /* Ramp mode */
              <div className="space-y-4 pl-1 border-l-2 border-amber/20">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-text-tertiary mb-1 block">
                      Max Discount (day 1): <span className="font-bold text-red-400">-{config.lastMinuteMaxDiscountPct}%</span>
                    </Label>
                    <Slider
                      min={5} max={60} step={5}
                      value={[config.lastMinuteMaxDiscountPct]}
                      onValueChange={([v]) => onConfigChange({ lastMinuteMaxDiscountPct: v })}
                    />
                    <p className="text-[10px] text-muted-foreground/80 mt-1">Deepest discount applied on day of check-in</p>
                  </div>
                  <div>
                    <Label className="text-xs text-text-tertiary mb-1 block">
                      Min Discount (day N): <span className="font-bold text-amber">-{config.lastMinuteMinDiscountPct}%</span>
                    </Label>
                    <Slider
                      min={1} max={30} step={1}
                      value={[config.lastMinuteMinDiscountPct]}
                      onValueChange={([v]) => onConfigChange({ lastMinuteMinDiscountPct: v })}
                    />
                    <p className="text-[10px] text-muted-foreground/80 mt-1">Discount starts tapering from this day</p>
                  </div>
                </div>
                <div className="w-64">
                  <Label className="text-xs text-text-tertiary mb-1 block">
                    Ramp Window: <span className="font-bold text-text-primary">{config.lastMinuteRampDays} days</span>
                  </Label>
                  <Slider
                    min={3} max={30} step={1}
                    value={[config.lastMinuteRampDays]}
                    onValueChange={([v]) => onConfigChange({ lastMinuteRampDays: v })}
                  />
                  <p className="text-[10px] text-text-disabled mt-1">
                    Curve spans day 1 ({config.lastMinuteMaxDiscountPct}%) → day {config.lastMinuteRampDays} ({config.lastMinuteMinDiscountPct}%)
                  </p>
                </div>
              </div>
            ) : (
              /* Flat mode */
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-text-tertiary mb-1 block">
                    Discount: <span className="font-bold text-red-400">-{config.lastMinuteDiscountPct}%</span>
                  </Label>
                  <Slider
                    min={5} max={60} step={5}
                    value={[config.lastMinuteDiscountPct]}
                    onValueChange={([v]) => onConfigChange({ lastMinuteDiscountPct: v })}
                  />
                </div>
                <div>
                  <Label className="text-xs text-text-tertiary mb-1 block">
                    Trigger Window: <span className="font-bold text-text-primary">{config.lastMinuteDaysOut} days out</span>
                  </Label>
                  <Slider
                    min={1} max={30} step={1}
                    value={[config.lastMinuteDaysOut]}
                    onValueChange={([v]) => onConfigChange({ lastMinuteDaysOut: v })}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Far-Out */}
      <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Far-Out Premium</h3>
            <p className="text-[11px] text-text-tertiary mt-0.5">Markup for bookings made far in advance</p>
          </div>
          <Switch
            checked={config.farOutEnabled}
            onCheckedChange={(v) => onConfigChange({ farOutEnabled: v })}
          />
        </div>
        {config.farOutEnabled && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-text-tertiary mb-1 block">
                Markup: <span className="font-bold text-green-400">+{config.farOutMarkupPct}%</span>
              </Label>
              <Slider
                min={0} max={40} step={5}
                value={[config.farOutMarkupPct]}
                onValueChange={([v]) => onConfigChange({ farOutMarkupPct: v })}
              />
            </div>
            <div>
              <Label className="text-xs text-text-tertiary mb-1 block">
                Trigger: bookings <span className="font-bold text-text-primary">{config.farOutDaysOut}+ days out</span>
              </Label>
              <Slider
                min={30} max={180} step={10}
                value={[config.farOutDaysOut]}
                onValueChange={([v]) => onConfigChange({ farOutDaysOut: v })}
              />
            </div>
            <div>
              <Label className="text-xs text-text-tertiary mb-1.5 block">Far-Out Minimum Price Floor</Label>
              <Input
                type="number"
                min={0}
                value={config.farOutMinPrice ?? 0}
                onChange={(e) => onConfigChange({ farOutMinPrice: Number(e.target.value || 0) })}
                placeholder="0 disables explicit floor"
                className="h-8 text-sm bg-white/5 border-white/10"
              />
            </div>
          </div>
        )}
      </div>

      <Button
        size="sm"
        onClick={handleSave}
        disabled={saving}
        className="bg-amber text-black hover:bg-amber/90 h-9 text-xs gap-2"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        Save Lead Time Rules
      </Button>
    </div>
  );
}

// ── Gap Logic Tab ─────────────────────────────────────────────────────────────

function GapLogicTab({
  listingId,
  config,
  onConfigChange,
}: {
  listingId: string;
  config: EngineConfig;
  onConfigChange: (patch: Partial<EngineConfig>) => void;
}) {
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await patchConfig(listingId, {
        gapPreventionEnabled: config.gapPreventionEnabled,
        minFragmentThreshold: config.minFragmentThreshold,
        gapFillEnabled: config.gapFillEnabled,
        gapFillLengthMin: config.gapFillLengthMin,
        gapFillLengthMax: config.gapFillLengthMax,
        gapFillDiscountPct: config.gapFillDiscountPct,
        gapFillDiscountWeekdayPct: config.gapFillDiscountWeekdayPct,
        gapFillDiscountWeekendPct: config.gapFillDiscountWeekendPct,
        gapFillMaxDaysUntilCheckin: config.gapFillMaxDaysUntilCheckin,
        gapFillOverrideCico: config.gapFillOverrideCico,
        adjacentAdjustmentEnabled: config.adjacentAdjustmentEnabled,
        adjacentAdjustmentPct: config.adjacentAdjustmentPct,
        adjacentTurnoverCost: config.adjacentTurnoverCost,
      });
      toast.success("Gap logic saved to database.");
    } catch {
      toast.error("Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Gap Prevention */}
      <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Gap Prevention (Tetris Logic)</h3>
            <p className="text-[11px] text-text-tertiary mt-0.5">Raise min stay to prevent unbookable fragments between reservations</p>
          </div>
          <Switch
            checked={config.gapPreventionEnabled}
            onCheckedChange={(v) => onConfigChange({ gapPreventionEnabled: v })}
          />
        </div>
        {config.gapPreventionEnabled && (
          <div className="w-56">
            <Label className="text-xs text-text-tertiary mb-1 block">
              Min Viable Fragment: <span className="font-bold text-text-primary">{config.minFragmentThreshold} nights</span>
            </Label>
            <Slider
              min={1} max={7} step={1}
              value={[config.minFragmentThreshold]}
              onValueChange={([v]) => onConfigChange({ minFragmentThreshold: v })}
            />
            <p className="text-[10px] text-text-disabled mt-1">
              Gaps shorter than this are blocked to prevent orphan days
            </p>
          </div>
        )}
      </div>

      {/* Gap Fill Discounts */}
      <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Gap Fill Discounts</h3>
            <p className="text-[11px] text-text-tertiary mt-0.5">Discount short windows between bookings to encourage occupancy</p>
          </div>
          <Switch
            checked={config.gapFillEnabled}
            onCheckedChange={(v) => onConfigChange({ gapFillEnabled: v })}
          />
        </div>
        {config.gapFillEnabled && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-text-tertiary mb-1 block">
                  Gap Size: <span className="font-bold text-text-primary">{config.gapFillLengthMin}–{config.gapFillLengthMax} nights</span>
                </Label>
                <div className="flex gap-2 items-center">
                  <Input
                    type="number" min={1}
                    value={config.gapFillLengthMin}
                    onChange={(e) => onConfigChange({ gapFillLengthMin: Number(e.target.value) })}
                    className="h-8 w-20 text-sm bg-white/5 border-white/10"
                  />
                  <span className="text-muted-foreground text-xs">to</span>
                  <Input
                    type="number" min={1}
                    value={config.gapFillLengthMax}
                    onChange={(e) => onConfigChange({ gapFillLengthMax: Number(e.target.value) })}
                    className="h-8 w-20 text-sm bg-white/5 border-white/10"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs text-text-tertiary mb-1 block">
                  Discount: <span className="font-bold text-amber">-{config.gapFillDiscountPct}%</span>
                </Label>
                <Slider
                  min={0} max={30} step={1}
                  value={[config.gapFillDiscountPct]}
                  onValueChange={([v]) => onConfigChange({ gapFillDiscountPct: v })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-xs text-text-tertiary mb-1.5 block">Weekday Discount % (optional)</Label>
                <Input
                  type="number"
                  min={0}
                  value={config.gapFillDiscountWeekdayPct ?? 0}
                  onChange={(e) => onConfigChange({ gapFillDiscountWeekdayPct: Number(e.target.value || 0) })}
                  className="h-8 text-sm bg-white/5 border-white/10"
                />
              </div>
              <div>
                <Label className="text-xs text-text-tertiary mb-1.5 block">Weekend Discount % (optional)</Label>
                <Input
                  type="number"
                  min={0}
                  value={config.gapFillDiscountWeekendPct ?? 0}
                  onChange={(e) => onConfigChange({ gapFillDiscountWeekendPct: Number(e.target.value || 0) })}
                  className="h-8 text-sm bg-white/5 border-white/10"
                />
              </div>
              <div>
                <Label className="text-xs text-text-tertiary mb-1.5 block">Max Days Until Check-in</Label>
                <Input
                  type="number"
                  min={1}
                  value={config.gapFillMaxDaysUntilCheckin ?? 30}
                  onChange={(e) => onConfigChange({ gapFillMaxDaysUntilCheckin: Number(e.target.value || 30) })}
                  className="h-8 text-sm bg-white/5 border-white/10"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
              <Switch
                checked={config.gapFillOverrideCico}
                onCheckedChange={(v) => onConfigChange({ gapFillOverrideCico: v })}
              />
              Override check-in/out restrictions to fill gaps
            </label>
            <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
              <Switch
                checked={config.adjacentAdjustmentEnabled}
                onCheckedChange={(v) => onConfigChange({ adjacentAdjustmentEnabled: v })}
              />
              Apply adjacent-booking adjustment (nights before/after a booking)
            </label>
            {config.adjacentAdjustmentEnabled && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-text-tertiary mb-1.5 block">Adjacent Adjustment %</Label>
                  <Input
                    type="number"
                    value={config.adjacentAdjustmentPct ?? 0}
                    onChange={(e) => onConfigChange({ adjacentAdjustmentPct: Number(e.target.value || 0) })}
                    className="h-8 text-sm bg-white/5 border-white/10"
                  />
                </div>
                <div>
                  <Label className="text-xs text-text-tertiary mb-1.5 block">Turnaround Cost Add-on</Label>
                  <Input
                    type="number"
                    value={config.adjacentTurnoverCost ?? 0}
                    onChange={(e) => onConfigChange({ adjacentTurnoverCost: Number(e.target.value || 0) })}
                    className="h-8 text-sm bg-white/5 border-white/10"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-start gap-2 text-xs text-text-tertiary bg-white/[0.02] border border-white/5 rounded-lg p-3">
        <Info className="h-3.5 w-3.5 mt-0.5 text-blue-400 shrink-0" />
        Gap fill discounts are bounded by your floor price. The waterfall applies gap logic at Pass 3 (Inventory layer).
      </div>

      <Button
        size="sm"
        onClick={handleSave}
        disabled={saving}
        className="bg-amber text-black hover:bg-amber/90 h-9 text-xs gap-2"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        Save Gap Logic
      </Button>
    </div>
  );
}

// ── LOS Discounts Tab ─────────────────────────────────────────────────────────

function LOSTab({
  listingId,
  rules,
  onRulesChange,
}: {
  listingId: string;
  rules: PricingRule[];
  onRulesChange: () => void;
}) {
  const losRules = rules.filter((r) => r.ruleType === "LOS_DISCOUNT");
  const [newNights, setNewNights] = useState("7");
  const [newDiscount, setNewDiscount] = useState(10);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!newNights) return;
    setSaving(true);
    try {
      await createRule(listingId, {
        ruleType: "LOS_DISCOUNT",
        name: `${newNights}+ Night Discount`,
        enabled: true,
        priority: 5,
        minNights: Number(newNights),
        priceAdjPct: -Math.abs(newDiscount),
        isBlocked: false,
        closedToArrival: false,
        closedToDeparture: false,
        suspendLastMinute: false,
        suspendGapFill: false,
      });
      toast.success(`LOS discount for ${newNights}+ nights saved to database.`);
      setNewNights("7"); setNewDiscount(10);
      onRulesChange();
    } catch {
      toast.error("Failed to save LOS rule.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rule: PricingRule) => {
    setDeletingId(rule._id);
    try {
      await deleteRule(listingId, rule._id);
      toast.success("LOS rule deleted.");
      onRulesChange();
    } catch {
      toast.error("Failed to delete.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggle = async (rule: PricingRule) => {
    try {
      await toggleRule(listingId, rule._id, !rule.enabled);
      onRulesChange();
    } catch {
      toast.error("Failed to update.");
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-tertiary">
        Length-of-stay discounts reward longer bookings. Evaluated as "≥ N nights → apply discount".
      </p>

      {losRules.length > 0 && (
        <div className="space-y-2">
          {losRules.sort((a, b) => (a.minNights ?? 0) - (b.minNights ?? 0)).map((rule) => (
            <div
              key={rule._id}
              className="rounded-lg border border-white/5 bg-white/[0.02] p-4 flex items-center gap-4"
            >
              <Switch checked={rule.enabled} onCheckedChange={() => handleToggle(rule)} />
              <div className="flex-1">
                <p className="text-sm font-medium text-text-primary">{rule.name}</p>
                <p className="text-[11px] text-text-tertiary">{rule.minNights}+ nights minimum</p>
              </div>
              <Badge className="bg-green-500/10 text-green-400 border border-green-500/20 text-[10px]">
                {rule.priceAdjPct}%
              </Badge>
              <Button
                variant="ghost" size="icon"
                disabled={deletingId === rule._id}
                onClick={() => handleDelete(rule)}
                className="h-7 w-7 text-muted-foreground hover:text-red-400"
              >
                {deletingId === rule._id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-dashed border-white/10 p-4 space-y-3">
        <p className="text-xs font-medium text-text-secondary">Add LOS Tier</p>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="w-28">
            <Label className="text-xs text-text-tertiary mb-1 block">Min Nights</Label>
            <Input
              type="number" min={2}
              value={newNights}
              onChange={(e) => setNewNights(e.target.value)}
              className="h-8 text-sm bg-white/5 border-white/10"
            />
          </div>
          <div className="w-52">
            <Label className="text-xs text-text-tertiary mb-1 block">
              Discount: <span className="font-bold text-green-400">-{newDiscount}%</span>
            </Label>
            <Slider min={1} max={30} step={1} value={[newDiscount]} onValueChange={([v]) => setNewDiscount(v)} />
          </div>
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={saving}
            className="bg-amber text-black hover:bg-amber/90 h-8 text-xs gap-1.5"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add Tier
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Date Overrides Tab ────────────────────────────────────────────────────────

function DateOverridesTab({
  listingId,
  rules,
  onRulesChange,
  currency = "AED",
}: {
  listingId: string;
  rules: PricingRule[];
  onRulesChange: () => void;
  currency?: string;
}) {
  const overrideRules = rules.filter((r) => r.ruleType === "ADMIN_BLOCK" || r.ruleType === "EVENT");
  const [newDate, setNewDate] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newMinStay, setNewMinStay] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!newDate || !newLabel) {
      toast.error("Date and label are required.");
      return;
    }
    setSaving(true);
    try {
      await createRule(listingId, {
        ruleType: "ADMIN_BLOCK",
        name: newLabel,
        enabled: true,
        priority: 100,
        startDate: newDate,
        endDate: newDate,
        priceOverride: newPrice ? Number(newPrice) : undefined,
        minStayOverride: newMinStay ? Number(newMinStay) : undefined,
        isBlocked: false,
        closedToArrival: false,
        closedToDeparture: false,
        suspendLastMinute: true,
        suspendGapFill: false,
      });
      toast.success(`Override for "${newLabel}" saved to database.`);
      setNewDate(""); setNewLabel(""); setNewPrice(""); setNewMinStay("");
      onRulesChange();
    } catch {
      toast.error("Failed to save override.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rule: PricingRule) => {
    setDeletingId(rule._id);
    try {
      await deleteRule(listingId, rule._id);
      toast.success("Override deleted.");
      onRulesChange();
    } catch {
      toast.error("Failed to delete.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-tertiary">
        Date overrides take the highest priority (Pass 1). Use for events like F1, NYE, Eid.
        Suspends last-minute discounts automatically.
      </p>

      {overrideRules.length > 0 && (
        <div className="space-y-2">
          {overrideRules.sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? "")).map((rule) => (
            <div
              key={rule._id}
              className="rounded-lg border border-white/5 bg-white/[0.02] p-3 flex items-center gap-4"
            >
              <div className="font-mono text-xs text-text-secondary w-24 shrink-0">{rule.startDate}</div>
              <div className="flex-1 text-sm text-text-primary">{rule.name}</div>
              {rule.priceOverride && (
                <Badge className="bg-green-500/10 text-green-400 border border-green-500/20 text-[10px]">
                  {currency} {rule.priceOverride.toLocaleString("en-US")}
                </Badge>
              )}
              {rule.minStayOverride && (
                <Badge className="bg-white/5 text-text-tertiary border border-white/10 text-[10px]">
                  {rule.minStayOverride}N min
                </Badge>
              )}
              <Button
                variant="ghost" size="icon"
                disabled={deletingId === rule._id}
                onClick={() => handleDelete(rule)}
                className="h-7 w-7 text-muted-foreground hover:text-red-400"
              >
                {deletingId === rule._id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-dashed border-white/10 p-4 space-y-3">
        <p className="text-xs font-medium text-text-secondary">Add Date Override</p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs text-text-tertiary mb-1 block">Date</Label>
            <Input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="h-8 text-sm bg-white/5 border-white/10 w-36"
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <Label className="text-xs text-text-tertiary mb-1 block">Label / Event Name</Label>
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Formula 1 Grand Prix"
              className="h-8 text-sm bg-white/5 border-white/10"
            />
          </div>
          <div className="w-28">
            <Label className="text-xs text-text-tertiary mb-1 block">Fixed Price ({currency})</Label>
            <Input
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              placeholder="optional"
              className="h-8 text-sm bg-white/5 border-white/10"
            />
          </div>
          <div className="w-24">
            <Label className="text-xs text-text-tertiary mb-1 block">Min Stay</Label>
            <Input
              type="number"
              value={newMinStay}
              onChange={(e) => setNewMinStay(e.target.value)}
              placeholder="optional"
              className="h-8 text-sm bg-white/5 border-white/10"
            />
          </div>
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={saving}
            className="bg-amber text-black hover:bg-amber/90 h-8 text-xs gap-1.5"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add Override
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Occupancy Tab (KB Tier 1 #4 — Revenue 9/10) ──────────────────────────────

function OccupancyTab({
  listingId,
  config,
  onConfigChange,
}: {
  listingId: string;
  config: EngineConfig;
  onConfigChange: (patch: Partial<EngineConfig>) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [pack, setPack] = useState<MarketPricingPack | null>(null);
  const [previewProfileId, setPreviewProfileId] = useState<string | null>(null);
  const [inheritPortfolio, setInheritPortfolio] = useState(config.usePortfolioPricingDefaults !== false);
  const portfolioProfiles = pack?.pricingProfiles ?? [];

  useEffect(() => {
    fetch("/api/pricing/profiles")
      .then((r) => r.json())
      .then((d) => {
        const loaded = d.pack as MarketPricingPack | undefined;
        setPack(loaded ?? null);
        if (loaded) {
          const { profile } = resolveSeasonForDate(loaded);
          if (profile) setPreviewProfileId(profile.id);
        }
      })
      .catch(() => {});
  }, []);

  const previewProfile =
    portfolioProfiles.find((p) => p.id === previewProfileId) ??
    (pack ? resolveSeasonForDate(pack).profile : null);
  const previewSegment = pack && previewProfile
    ? pack.seasonalCalendars
        .find((c) => c.id === pack.portfolioDefaults.defaultSeasonalCalendarId)
        ?.segments.find((s) => s.pricingProfileId === previewProfile.id) ?? resolveSeasonForDate(pack).segment
    : null;

  const applyPresetMatrix = (profileId: string) => {
    const profile = portfolioProfiles.find((p) => p.id === profileId);
    if (!profile) return;
    onConfigChange({
      occupancyMatrix: profile.occupancyMatrix,
      occupancyPreset: profile.occupancyPreset,
      occupancyEnabled: true,
      usePortfolioPricingDefaults: false,
    });
    setInheritPortfolio(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await patchConfig(listingId, {
        occupancyEnabled: config.occupancyEnabled,
        occupancyLookbackDays: config.occupancyLookbackDays,
        occupancyMatrix: config.occupancyMatrix,
        occupancyPreset: config.occupancyPreset,
        usePortfolioPricingDefaults: inheritPortfolio,
        pricingProfileOverrideId: inheritPortfolio ? null : config.pricingProfileOverrideId,
      });
      toast.success("Unit occupancy rules saved.");
    } catch {
      toast.error("Failed to save occupancy rules.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-2 text-xs bg-amber/5 border border-amber/20 rounded-lg p-3">
        <Info className="h-3.5 w-3.5 mt-0.5 text-amber shrink-0" />
        <span className="text-text-secondary">
          <span className="font-semibold text-amber">KB Tier 1 #4 — Revenue 9/10.</span>{" "}
          The single most powerful revenue lever for multi-unit operators. Adjusts prices dynamically
          based on how booked the property already is relative to a target occupancy rate.
        </span>
      </div>
      <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4 space-y-2">
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Auto Base Price Confidence</h3>
        <p className="text-[11px] text-text-tertiary">
          {config.basePriceSource === "history_1y"
            ? "Base price is calculated as the average of this property's last 1-year historical prices."
            : config.basePriceSource === "benchmark"
              ? "Base price is currently sourced from benchmark market data (recommended weekday / p50 fallback)."
              : "Base price is currently sourced from the listing's Hostaway base price fallback."}
        </p>
        <p className="text-[11px] text-text-tertiary">
          Source: <span className="font-semibold text-text-primary">
            {config.basePriceSource === "history_1y"
              ? "1-year historical average"
              : config.basePriceSource === "benchmark"
                ? "Benchmark"
                : "Hostaway fallback"}
          </span> · Confidence:{" "}
          <span className="font-semibold text-text-primary">{config.basePriceConfidencePct}%</span> · Sample size:{" "}
          <span className="font-semibold text-text-primary">{config.basePriceSampleSize}</span>
        </p>
      </div>

      {/* Master toggle */}
      <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Occupancy-Based Pricing</h3>
            <p className="text-[11px] text-text-tertiary mt-0.5">
              Raise prices when ahead of target, discount when behind
            </p>
          </div>
          <Switch
            checked={config.occupancyEnabled}
            onCheckedChange={(v) => onConfigChange({ occupancyEnabled: v })}
          />
        </div>
      </div>

      {config.occupancyEnabled && (
        <>
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Scope</h3>
                <p className="text-[11px] text-text-tertiary mt-0.5">
                  {inheritPortfolio
                    ? "Inherits portfolio seasonal profile matrix (group overrides still apply)."
                    : "Unit-level matrix overrides portfolio and group."}
                </p>
              </div>
              <Switch
                checked={inheritPortfolio}
                onCheckedChange={(v) => {
                  setInheritPortfolio(v);
                  const patch: Partial<EngineConfig> = { usePortfolioPricingDefaults: v };
                  if (!v && !config.occupancyMatrix && portfolioProfiles[0]) {
                    patch.occupancyMatrix = portfolioProfiles[0].occupancyMatrix;
                    patch.occupancyPreset = portfolioProfiles[0].occupancyPreset;
                  }
                  onConfigChange(patch);
                }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              {inheritPortfolio ? "Using portfolio defaults" : "Custom unit override"}
            </p>
          </div>

          {inheritPortfolio && previewProfile?.occupancyMatrix && (
            <div className="rounded-lg border border-amber/20 bg-amber/5 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    Active portfolio matrix (read-only)
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Occupancy × lead-time matrix from your active seasonal calendar.
                  </p>
                </div>
                <Select value={previewProfileId ?? previewProfile.id} onValueChange={setPreviewProfileId}>
                  <SelectTrigger className="h-8 w-44 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {portfolioProfiles.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="text-[10px]">{previewProfile.name}</Badge>
                {previewSegment && (
                  <Badge variant="outline" className="text-[10px]">{previewSegment.name} season</Badge>
                )}
              </div>
              <OccupancyMatrixEditor
                matrix={previewProfile.occupancyMatrix as OccupancyMatrix}
                onChange={() => {}}
                readOnly
              />
              <p className="text-[10px] text-muted-foreground">
                To edit High / Low / Shoulder profiles or the seasonal calendar, choose{" "}
                <span className="font-medium text-foreground">Portfolio defaults</span> in the header dropdown.
              </p>
            </div>
          )}

          {!inheritPortfolio && (
            <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4 space-y-3">
              <Label className="text-xs">Load preset from portfolio profile</Label>
              <Select onValueChange={applyPresetMatrix}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Choose preset…" />
                </SelectTrigger>
                <SelectContent>
                  {portfolioProfiles.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      {p.name} ({p.occupancyPreset})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {config.occupancyMatrix && (
                <OccupancyMatrixEditor
                  matrix={config.occupancyMatrix as OccupancyMatrix}
                  onChange={(occupancyMatrix) => onConfigChange({ occupancyMatrix })}
                />
              )}
            </div>
          )}

          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
            <Label className="text-xs text-text-tertiary mb-1 block">
              Lookback: <span className="font-bold text-text-primary">{config.occupancyLookbackDays} days</span>
            </Label>
            <Slider
              min={7}
              max={90}
              step={7}
              value={[config.occupancyLookbackDays]}
              onValueChange={([v]) => onConfigChange({ occupancyLookbackDays: v })}
            />
            <p className="text-[10px] text-muted-foreground/80 mt-2">
              Rolling occupancy % calculated over this window · Applied in Pass 2 of the waterfall
            </p>
          </div>
        </>
      )}

      <Button
        size="sm"
        onClick={handleSave}
        disabled={saving}
        className="bg-amber text-black hover:bg-amber/90 h-9 text-xs gap-2"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        Save Occupancy Rules
      </Button>
    </div>
  );
}

// ── Minstay Tab (unit override) ───────────────────────────────────────────────

function MinStayTab({
  listingId,
  config,
  onConfigChange,
}: {
  listingId: string;
  config: EngineConfig;
  onConfigChange: (patch: Partial<EngineConfig>) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [pack, setPack] = useState<MarketPricingPack | null>(null);
  const inherit = config.usePortfolioPricingDefaults !== false && !config.minStayProfileOverrideId;

  useEffect(() => {
    fetch("/api/pricing/profiles")
      .then((r) => r.json())
      .then((d) => setPack(d.pack ?? null))
      .catch(() => {});
  }, []);

  const selected = pack?.minStayProfiles.find(
    (p) => p.id === config.minStayProfileOverrideId
  );
  const inherited = pack ? resolveSeasonForDate(pack) : { segment: null, profile: null };
  const inheritedMinStay =
    pack?.minStayProfiles.find((p) => p.id === inherited.segment?.minStayProfileId) ??
    pack?.minStayProfiles[0] ??
    null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await patchConfig(listingId, {
        minStayProfileOverrideId: inherit ? null : config.minStayProfileOverrideId,
        usePortfolioPricingDefaults: inherit ? true : false,
      });
      toast.success("Minstay settings saved.");
    } catch {
      toast.error("Failed to save minstay settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4 flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider">Inherit portfolio minstay</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Seasonal calendar picks MLOS profile per date (MLOS Final, NY, etc.)
          </p>
        </div>
        <Switch
          checked={inherit}
          onCheckedChange={(v) => {
            if (v) {
              onConfigChange({ minStayProfileOverrideId: null, usePortfolioPricingDefaults: true });
            } else {
              onConfigChange({
                minStayProfileOverrideId: pack?.minStayProfiles[0]?.id ?? null,
                usePortfolioPricingDefaults: false,
              });
            }
          }}
        />
      </div>

      {inherit && inheritedMinStay && (
        <div className="rounded-lg border border-amber/20 bg-amber/5 p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider">Active portfolio minstay (read-only)</h3>
            <Badge variant="secondary" className="text-[10px]">{inheritedMinStay.name}</Badge>
            {inherited.segment && (
              <Badge variant="outline" className="text-[10px]">{inherited.segment.name} season</Badge>
            )}
          </div>
          <MinStayProfileEditor profile={inheritedMinStay} onChange={() => {}} readOnly />
          <p className="text-[10px] text-muted-foreground">
            To edit MLOS Final, NY, or seasonal mapping, choose{" "}
            <span className="font-medium text-foreground">Portfolio defaults</span> in the header dropdown.
          </p>
        </div>
      )}

      {!inherit && pack && (
        <div className="space-y-3">
          <Label className="text-xs">Unit minstay profile override</Label>
          <Select
            value={config.minStayProfileOverrideId ?? undefined}
            onValueChange={(id) => onConfigChange({ minStayProfileOverrideId: id })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select profile" />
            </SelectTrigger>
            <SelectContent>
              {pack.minStayProfiles.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selected && <MinStayProfileEditor profile={selected} onChange={() => {}} readOnly />}
          <p className="text-[10px] text-muted-foreground">
            Pick a different profile above, or turn off override to inherit portfolio defaults.
          </p>
        </div>
      )}

      <Button size="sm" onClick={handleSave} disabled={saving} className="bg-amber text-black hover:bg-amber/90 h-9 text-xs gap-2">
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        Save Minstay Settings
      </Button>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

const STUDIO_TABS = [
  { value: "guardrails", label: "Guardrails", icon: Shield, tooltip: "Global floor/ceiling prices and stay limits. These always win last." },
  { value: "seasons", label: "Seasons", icon: Sun, tooltip: "Seasonal calendar — maps date ranges to pricing & minimum-stay profiles." },
  { value: "leadtime", label: "Lead Time", icon: Clock, tooltip: "Last-minute discounts, far-out premiums, and day-of-week logic." },
  { value: "gap", label: "Gap Logic", icon: Layers, tooltip: "Inventory rules for orphan nights and short gaps between bookings." },
  { value: "los", label: "LOS Discounts", icon: TrendingDown, tooltip: "Length of Stay discounts (e.g. 7+ nights, 30+ nights)." },
  { value: "overrides", label: "Date Overrides", icon: AlignLeft, tooltip: "High-priority overrides for specific events or manual blocks." },
  { value: "occupancy", label: "Occupancy", icon: Activity, tooltip: "Occupancy × lead-time matrix tied to your portfolio calendar." },
  { value: "minstay", label: "Minstay", icon: CalendarRange, tooltip: "Minimum stay profile — inherit portfolio or override per unit." },
];

interface Props {
  listings: Listing[];
}

export function PricingRulesStudio({ listings }: Props) {
  const [activeTab, setActiveTab] = useState<string>("guardrails");
  const [selectedListingId, setSelectedListingId] = useState<string>(
    listings[0]?.id ?? ""
  );
  const [config, setConfig] = useState<EngineConfig>(DEFAULT_CONFIG);
  const [rules, setRules] = useState<PricingRule[]>([]);
  const selectedCurrency = listings.find((l) => l.id === selectedListingId)?.currencyCode || "AED";
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async (listingId: string) => {
    if (!listingId) return;
    setLoading(true);
    try {
      if (!listingId || !isPersistedListingId(listingId)) {
        setConfig(DEFAULT_CONFIG);
        setRules([]);
        return;
      }
      const [cfgRes, rulesRes] = await Promise.all([
        fetch(`/api/listings/${listingId}/engine-config`),
        fetch(`/api/listings/${listingId}/rules`),
      ]);
      if (cfgRes.ok) {
        const data = await cfgRes.json();
        setConfig({ ...DEFAULT_CONFIG, ...data });
      }
      if (rulesRes.ok) {
        const data = await rulesRes.json();
        setRules(data);
      }
    } catch {
      toast.error("Failed to load listing configuration.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedListingId) loadData(selectedListingId);
  }, [selectedListingId, loadData]);

  const handleConfigChange = (patch: Partial<EngineConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  };

  const handleRulesChange = () => {
    loadData(selectedListingId);
  };

  if (listings.length === 0) {
    return (
      <div className="rounded-xl border border-border/70 bg-card p-12 text-center shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
        <p className="text-muted-foreground text-sm">No active listings found.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/70 bg-card text-card-foreground overflow-hidden shadow-sm dark:border-white/10 dark:bg-white/[0.03] [&_input]:bg-background [&_input]:border-border/70 [&_input]:text-foreground [&_input]:placeholder:text-muted-foreground dark:[&_input]:bg-white/[0.04] dark:[&_input]:border-white/15 [&_label]:text-foreground [&_h3]:text-foreground [&_p]:text-muted-foreground">
      {/* Header with listing selector */}
      <div className="px-5 py-4 border-b border-border/70 flex items-center justify-between gap-4 dark:border-white/10">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Property pricing rules</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Per-unit overrides on top of portfolio defaults (Settings → Pricing). Guardrails
            always win last.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {!loading && selectedListingId && (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Loaded
            </span>
          )}
          <Select value={selectedListingId} onValueChange={setSelectedListingId}>
            <SelectTrigger className="w-64 h-8 text-xs bg-background border-border/70 text-foreground shadow-sm dark:bg-white/[0.04] dark:border-white/15">
              <SelectValue placeholder="Select property…" />
            </SelectTrigger>
            <SelectContent>
              {listings.map((l) => (
                <SelectItem key={l.id} value={l.id} className="text-xs">
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="px-5 pt-4">
        <PortfolioInheritanceBanner />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-text-tertiary" />
          <span className="text-muted-foreground text-sm">Loading configuration…</span>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="p-5">
          <TooltipProvider>
            <TabsList 
              id="tour-pricing-rules"
              className="flex flex-wrap gap-1.5 h-auto bg-muted/40 p-1.5 rounded-lg mb-5 border border-border/70 dark:border-white/10 dark:bg-white/[0.04]"
            >
              {STUDIO_TABS.map(({ value, label, icon: Icon, tooltip }) => (
                <Tooltip key={value}>
                  <TooltipTrigger asChild>
                    <TabsTrigger
                      value={value}
                      className={cn(
                        "gap-1.5 text-xs font-semibold transition-all rounded-md px-3 py-1.5 border relative",
                        activeTab === value
                          ? "bg-primary text-black border-primary shadow-lg ring-2 ring-primary/40 scale-[1.02] before:absolute before:inset-x-2 before:-bottom-1 before:h-0.5 before:rounded-full before:bg-primary"
                          : "bg-transparent text-muted-foreground border-transparent hover:bg-background hover:text-foreground dark:hover:bg-white/[0.05]"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </TabsTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-[10px] p-2 dark:bg-black border border-white/20">
                    {tooltip}
                  </TooltipContent>
                </Tooltip>
              ))}
            </TabsList>
          </TooltipProvider>

          <TabsContent value="guardrails">
            <GuardrailsTab
              listingId={selectedListingId}
              config={config}
              onConfigChange={handleConfigChange}
              currency={selectedCurrency}
            />
          </TabsContent>
          <TabsContent value="seasons">
            <SeasonsTab
              listingId={selectedListingId}
              config={config}
              onConfigChange={handleConfigChange}
              rules={rules}
              onRulesChange={handleRulesChange}
            />
          </TabsContent>
          <TabsContent value="leadtime">
            <LeadTimeTab
              listingId={selectedListingId}
              config={config}
              onConfigChange={handleConfigChange}
            />
          </TabsContent>
          <TabsContent value="gap">
            <GapLogicTab
              listingId={selectedListingId}
              config={config}
              onConfigChange={handleConfigChange}
            />
          </TabsContent>
          <TabsContent value="los">
            <LOSTab
              listingId={selectedListingId}
              rules={rules}
              onRulesChange={handleRulesChange}
            />
          </TabsContent>
          <TabsContent value="overrides">
            <DateOverridesTab
              listingId={selectedListingId}
              rules={rules}
              onRulesChange={handleRulesChange}
              currency={selectedCurrency}
            />
          </TabsContent>
          <TabsContent value="occupancy">
            <OccupancyTab
              listingId={selectedListingId}
              config={config}
              onConfigChange={handleConfigChange}
            />
          </TabsContent>
          <TabsContent value="minstay">
            <MinStayTab
              listingId={selectedListingId}
              config={config}
              onConfigChange={handleConfigChange}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

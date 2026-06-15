"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { getOrgId } from "@/lib/auth/client";
import {
  Layers,
  Plus,
  Trash2,
  Pencil,
  Home,
  X,
  Loader2,
  Save,
  ShieldCheck,
  Sun,
  TrendingDown,
  AlignLeft,
  ArrowLeft,
  Settings2,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GroupProfileOverrides } from "@/components/pricing/group-profile-overrides";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Listing {
  _id: string;
  name: string;
  area?: string;
  bedroomsNumber?: number;
}

interface PricingRule {
  _id: string;
  ruleType: "SEASON" | "EVENT" | "ADMIN_BLOCK" | "LOS_DISCOUNT";
  ruleCategory?:
    | "GUARDRAILS"
    | "SEASONS"
    | "LEAD_TIME"
    | "GAP_LOGIC"
    | "LOS_DISCOUNTS"
    | "DATE_OVERRIDES"
    | "OCCUPANCY";
  name: string;
  enabled: boolean;
  priority: number;
  startDate?: string;
  endDate?: string;
  daysOfWeek?: number[];
  minNights?: number;
  priceAdjPct?: number;
  priceOverride?: number;
  minPriceOverride?: number;
  maxPriceOverride?: number;
  minStayOverride?: number;
  isBlocked?: boolean;
  closedToArrival?: boolean;
  closedToDeparture?: boolean;
  suspendLastMinute?: boolean;
  suspendGapFill?: boolean;
}

interface PropertyGroup {
  _id: string;
  name: string;
  description?: string;
  color: string;
  listingIds: string[];
  pricingProfileOverrideId?: string;
  seasonalCalendarOverrideId?: string;
  minStayProfileOverrideId?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PALETTE = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#3b82f6",
];

const RULE_ICONS: Record<string, React.ReactNode> = {
  SEASON:      <Sun className="w-3.5 h-3.5" />,
  EVENT:       <ShieldCheck className="w-3.5 h-3.5" />,
  ADMIN_BLOCK: <AlignLeft className="w-3.5 h-3.5" />,
  LOS_DISCOUNT:<TrendingDown className="w-3.5 h-3.5" />,
};

const RULE_TYPE_LABELS: Record<string, string> = {
  SEASON: "Seasonal", EVENT: "Event", ADMIN_BLOCK: "Block", LOS_DISCOUNT: "LOS Discount",
};

const RULE_CATEGORY_LABELS: Record<string, string> = {
  GUARDRAILS: "Guardrails",
  SEASONS: "Seasons",
  LEAD_TIME: "Lead Time",
  GAP_LOGIC: "Gap Logic",
  LOS_DISCOUNTS: "LOS Discounts",
  DATE_OVERRIDES: "Date Overrides",
  OCCUPANCY: "Occupancy",
};

const CATEGORY_TO_RULE_TYPE: Record<string, PricingRule["ruleType"]> = {
  GUARDRAILS: "EVENT",
  SEASONS: "SEASON",
  LEAD_TIME: "EVENT",
  GAP_LOGIC: "EVENT",
  LOS_DISCOUNTS: "LOS_DISCOUNT",
  DATE_OVERRIDES: "ADMIN_BLOCK",
  OCCUPANCY: "EVENT",
};

function fallbackCategoryFromRuleType(ruleType: PricingRule["ruleType"]) {
  if (ruleType === "SEASON") return "SEASONS";
  if (ruleType === "ADMIN_BLOCK") return "DATE_OVERRIDES";
  if (ruleType === "LOS_DISCOUNT") return "LOS_DISCOUNTS";
  return "LEAD_TIME";
}

const WEEKDAY_OPTIONS = [
  { value: 0, label: "Mon" }, { value: 1, label: "Tue" }, { value: 2, label: "Wed" },
  { value: 3, label: "Thu" }, { value: 4, label: "Fri" }, { value: 5, label: "Sat" }, { value: 6, label: "Sun" },
];

// ── API ────────────────────────────────────────────────────────────────────────

async function api(path: string, options?: RequestInit) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

// ── GroupForm (edit group settings) ───────────────────────────────────────────

function GroupForm({
  initial,
  allListings,
  onSave,
  onCancel,
}: {
  initial: PropertyGroup;
  allListings: Listing[];
  onSave: (g: PropertyGroup) => void;
  onCancel: () => void;
}) {
  const safeListings = Array.isArray(allListings) ? allListings : [];
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? "");
  const [color, setColor] = useState(initial.color);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(initial.listingIds));
  const [saving, setSaving] = useState(false);
  const [locationFilter, setLocationFilter] = useState("all");
  const [bedroomFilter, setBedroomFilter] = useState("all");

  const locations = useMemo(
    () => Array.from(new Set(safeListings.map((l) => l.area?.trim()).filter(Boolean) as string[])).sort(),
    [safeListings]
  );
  const bedroomBuckets = useMemo(
    () =>
      Array.from(
        new Set(safeListings.map((l) => (l.bedroomsNumber && l.bedroomsNumber > 0 ? `${l.bedroomsNumber}BR` : "Studio / Other")))
      ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [safeListings]
  );

  const toggle = (id: string) =>
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const matchesFilters = (l: Listing) => {
    const loc = l.area?.trim() || "Unknown";
    const br = l.bedroomsNumber && l.bedroomsNumber > 0 ? `${l.bedroomsNumber}BR` : "Studio / Other";
    return (locationFilter === "all" || loc === locationFilter) && (bedroomFilter === "all" || br === bedroomFilter);
  };
  const visibleListings = safeListings.filter((l) => locationFilter === "all" && bedroomFilter === "all" ? true : matchesFilters(l));

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Group name is required"); return; }
    const orgId = getOrgId();
    if (!orgId) { toast.error("Session expired"); return; }
    setSaving(true);
    try {
      const saved = await api(`/api/groups/${initial._id}?orgId=${orgId}`, {
        method: "PUT",
        body: JSON.stringify({ name, description, color, listingIds: [...selectedIds] }),
      });
      onSave(saved);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-surface-1 border border-border-default rounded-xl p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-text-primary">Edit Group Settings</h3>
        <button onClick={onCancel} className="text-text-tertiary hover:text-text-primary p-1 rounded-lg hover:bg-surface-2">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Group name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Marina Portfolio" />
        </div>
        <div className="space-y-1.5">
          <Label>Colour</Label>
          <div className="flex gap-2 flex-wrap pt-0.5">
            {PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={cn("w-6 h-6 rounded-full border-2 transition-transform", color === c ? "border-white scale-110 shadow-md" : "border-transparent")}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Description <span className="text-text-tertiary text-xs">(optional)</span></Label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Dubai Marina beachfront units" />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Properties <span className="text-text-tertiary text-xs">({selectedIds.size} selected)</span></Label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="All locations" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All locations</SelectItem>
              {locations.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={bedroomFilter} onValueChange={setBedroomFilter}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {bedroomBuckets.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="border border-border-default rounded-lg divide-y divide-border-default max-h-52 overflow-y-auto">
          {visibleListings.length === 0 && <p className="p-3 text-xs text-text-tertiary">No properties found.</p>}
          {visibleListings.map((l) => (
            <label key={l._id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-surface-2 transition-colors">
              <input type="checkbox" checked={selectedIds.has(l._id)} onChange={() => toggle(l._id)} className="rounded border-border-default" />
              <span className="flex-1 text-sm text-text-primary truncate">{l.name}</span>
              {l.bedroomsNumber != null && <span className="text-xs text-text-tertiary shrink-0">{l.bedroomsNumber}BR</span>}
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Save className="w-4 h-4 mr-1.5" />}
          Save changes
        </Button>
      </div>
    </div>
  );
}

// ── RuleRow ────────────────────────────────────────────────────────────────────

function RuleRow({
  rule,
  groupId,
  onToggle,
  onDelete,
}: {
  rule: PricingRule;
  groupId: string;
  onToggle: (r: PricingRule) => void;
  onDelete: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api(`/api/groups/${groupId}/rules/${rule._id}`, { method: "DELETE" });
      onDelete(rule._id);
    } catch (e: any) {
      toast.error(e.message);
      setDeleting(false);
    }
  };

  const handleToggle = async () => {
    try {
      const updated = await api(`/api/groups/${groupId}/rules/${rule._id}`, {
        method: "PUT",
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      onToggle(updated);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const detail =
    rule.priceAdjPct != null
      ? `${rule.priceAdjPct > 0 ? "+" : ""}${rule.priceAdjPct}%`
      : rule.priceOverride != null
      ? "Fixed price"
      : rule.isBlocked
      ? "Blocked"
      : "—";

  const categoryLabel =
    RULE_CATEGORY_LABELS[(rule.ruleCategory || fallbackCategoryFromRuleType(rule.ruleType)) as keyof typeof RULE_CATEGORY_LABELS];

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors",
        rule.enabled
          ? "bg-surface-1 border-border-default"
          : "bg-surface-0 border-border-subtle opacity-60"
      )}
    >
      <span className="text-text-tertiary">{RULE_ICONS[rule.ruleType]}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{rule.name}</p>
        <p className="text-xs text-text-tertiary">
          {categoryLabel} · {RULE_TYPE_LABELS[rule.ruleType]} · {detail}
          {rule.startDate && ` · ${rule.startDate} → ${rule.endDate ?? "?"}`}
        </p>
      </div>
      <Switch checked={rule.enabled} onCheckedChange={handleToggle} />
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="text-text-tertiary hover:text-red-500 transition-colors p-1"
      >
        {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

// ── AddRuleForm ────────────────────────────────────────────────────────────────

function AddRuleForm({
  groupId,
  initialCategory,
  onAdded,
  onCancel,
}: {
  groupId: string;
  initialCategory: NonNullable<PricingRule["ruleCategory"]>;
  onAdded: (r: PricingRule) => void;
  onCancel: () => void;
}) {
  const [ruleCategory] = useState<NonNullable<PricingRule["ruleCategory"]>>(initialCategory);
  const [name, setName] = useState("");
  const [priceAdjPct, setPriceAdjPct] = useState("");
  const [priceOverride, setPriceOverride] = useState("");
  const [minPriceOverride, setMinPriceOverride] = useState("");
  const [maxPriceOverride, setMaxPriceOverride] = useState("");
  const [minStayOverride, setMinStayOverride] = useState("");
  const [minNights, setMinNights] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [isBlocked, setIsBlocked] = useState(ruleCategory === "DATE_OVERRIDES");
  const [closedToArrival, setClosedToArrival] = useState(false);
  const [closedToDeparture, setClosedToDeparture] = useState(false);
  const [suspendLastMinute, setSuspendLastMinute] = useState(ruleCategory === "GAP_LOGIC");
  const [suspendGapFill, setSuspendGapFill] = useState(ruleCategory === "GAP_LOGIC");
  const [saving, setSaving] = useState(false);

  const toggleDay = (day: number) =>
    setDaysOfWeek((prev) => prev.includes(day) ? prev.filter((v) => v !== day) : [...prev, day].sort((a, b) => a - b));

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Rule name is required"); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        ruleType: CATEGORY_TO_RULE_TYPE[ruleCategory],
        ruleCategory,
        name: name.trim(),
        enabled: true,
        priority: 0,
        isBlocked,
        closedToArrival,
        closedToDeparture,
        suspendLastMinute,
        suspendGapFill,
      };
      if (priceAdjPct !== "") payload.priceAdjPct = Number(priceAdjPct);
      if (priceOverride !== "") payload.priceOverride = Number(priceOverride);
      if (minPriceOverride !== "") payload.minPriceOverride = Number(minPriceOverride);
      if (maxPriceOverride !== "") payload.maxPriceOverride = Number(maxPriceOverride);
      if (minStayOverride !== "") payload.minStayOverride = Number(minStayOverride);
      if (minNights !== "") payload.minNights = Number(minNights);
      if (startDate) payload.startDate = startDate;
      if (endDate) payload.endDate = endDate;
      if (daysOfWeek.length > 0) payload.daysOfWeek = daysOfWeek;

      const rule = await api(`/api/groups/${groupId}/rules`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      onAdded(rule);
      toast.success("Rule added");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border-default bg-surface-0 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-text-primary">
            Add {RULE_CATEGORY_LABELS[ruleCategory]} Rule
          </p>
          <p className="text-xs text-text-tertiary mt-0.5">
            This rule applies to all properties in this group and overrides overlapping property rules.
          </p>
        </div>
        <Badge variant="secondary" className="text-[10px] shrink-0">
          {RULE_CATEGORY_LABELS[ruleCategory]}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Name</Label>
          <Input className="h-8 text-xs" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Eid Uplift" />
        </div>
        {(ruleCategory === "SEASONS" || ruleCategory === "LEAD_TIME" || ruleCategory === "LOS_DISCOUNTS" || ruleCategory === "OCCUPANCY") && (
          <div className="space-y-1">
            <Label className="text-xs">Price adj %</Label>
            <Input className="h-8 text-xs" type="number" value={priceAdjPct} onChange={(e) => setPriceAdjPct(e.target.value)} placeholder="e.g. 20" />
          </div>
        )}
        {(ruleCategory === "DATE_OVERRIDES" || ruleCategory === "GUARDRAILS") && (
          <div className="space-y-1">
            <Label className="text-xs">Fixed price</Label>
            <Input className="h-8 text-xs" type="number" value={priceOverride} onChange={(e) => setPriceOverride(e.target.value)} placeholder="e.g. 950" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Start date</Label>
          <Input className="h-8 text-xs" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">End date</Label>
          <Input className="h-8 text-xs" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        {(ruleCategory === "SEASONS" || ruleCategory === "LOS_DISCOUNTS" || ruleCategory === "DATE_OVERRIDES" || ruleCategory === "GUARDRAILS") && (
          <div className="space-y-1">
            <Label className="text-xs">Min stay override</Label>
            <Input className="h-8 text-xs" type="number" value={minStayOverride} onChange={(e) => setMinStayOverride(e.target.value)} placeholder="e.g. 3" />
          </div>
        )}
      </div>

      {ruleCategory === "GUARDRAILS" && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Min price override</Label>
            <Input className="h-8 text-xs" type="number" value={minPriceOverride} onChange={(e) => setMinPriceOverride(e.target.value)} placeholder="e.g. 400" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Max price override</Label>
            <Input className="h-8 text-xs" type="number" value={maxPriceOverride} onChange={(e) => setMaxPriceOverride(e.target.value)} placeholder="e.g. 2500" />
          </div>
        </div>
      )}

      {(ruleCategory === "LOS_DISCOUNTS" || ruleCategory === "LEAD_TIME" || ruleCategory === "GAP_LOGIC") && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Minimum nights</Label>
            <Input className="h-8 text-xs" type="number" value={minNights} onChange={(e) => setMinNights(e.target.value)} placeholder="e.g. 2" />
          </div>
          {ruleCategory === "GAP_LOGIC" && (
            <div className="space-y-1">
              <Label className="text-xs">Min stay override</Label>
              <Input className="h-8 text-xs" type="number" value={minStayOverride} onChange={(e) => setMinStayOverride(e.target.value)} placeholder="e.g. 1" />
            </div>
          )}
        </div>
      )}

      {(ruleCategory === "LEAD_TIME" || ruleCategory === "OCCUPANCY") && (
        <div className="space-y-2">
          <Label className="text-xs">Days of week</Label>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_OPTIONS.map((day) => {
              const active = daysOfWeek.includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => toggleDay(day.value)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors",
                    active
                      ? "border-primary bg-primary text-black"
                      : "border-border-default bg-background text-muted-foreground hover:text-foreground"
                  )}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {(ruleCategory === "GAP_LOGIC" || ruleCategory === "DATE_OVERRIDES") && (
        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center justify-between rounded-lg border border-border-default bg-background px-3 py-2">
            <span className="text-xs text-foreground">Block date</span>
            <Switch checked={isBlocked} onCheckedChange={setIsBlocked} />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-border-default bg-background px-3 py-2">
            <span className="text-xs text-foreground">Closed to arrival</span>
            <Switch checked={closedToArrival} onCheckedChange={setClosedToArrival} />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-border-default bg-background px-3 py-2">
            <span className="text-xs text-foreground">Closed to departure</span>
            <Switch checked={closedToDeparture} onCheckedChange={setClosedToDeparture} />
          </label>
          {ruleCategory === "GAP_LOGIC" && (
            <>
              <label className="flex items-center justify-between rounded-lg border border-border-default bg-background px-3 py-2">
                <span className="text-xs text-foreground">Suspend last-minute logic</span>
                <Switch checked={suspendLastMinute} onCheckedChange={setSuspendLastMinute} />
              </label>
              <label className="flex items-center justify-between rounded-lg border border-border-default bg-background px-3 py-2">
                <span className="text-xs text-foreground">Suspend gap-fill logic</span>
                <Switch checked={suspendGapFill} onCheckedChange={setSuspendGapFill} />
              </label>
            </>
          )}
        </div>
      )}

      <div className="rounded-lg border border-border-default bg-background px-3 py-2 text-[11px] text-muted-foreground">
        {ruleCategory === "GUARDRAILS" && "Enforce temporary min/max pricing bounds or fixed-rate exceptions across the whole group."}
        {ruleCategory === "SEASONS" && "Use date ranges plus price and stay changes for seasonal periods shared by all group members."}
        {ruleCategory === "LEAD_TIME" && "Raise or lower pricing for selected weekdays or booking windows across the group."}
        {ruleCategory === "GAP_LOGIC" && "Protect short gaps, change arrival/departure behavior, or suspend listing-level automation during special windows."}
        {ruleCategory === "LOS_DISCOUNTS" && "Apply group-wide discounts or min-stay rules tied to booking length."}
        {ruleCategory === "DATE_OVERRIDES" && "Block dates, set fixed prices, or force stay rules on specific dates for every property in the group."}
        {ruleCategory === "OCCUPANCY" && "Add occupancy-driven price adjustments before any listing-specific rule."}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" className="h-8 text-xs" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
          Add rule
        </Button>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function GroupDetailPage() {
  const router = useRouter();
  const params = useParams();
  const groupId = params.id as string;

  const [group, setGroup] = useState<PropertyGroup | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRules, setLoadingRules] = useState(true);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [activeRuleCategory, setActiveRuleCategory] = useState<NonNullable<PricingRule["ruleCategory"]>>("GUARDRAILS");

  const load = useCallback(async () => {
    setLoading(true);
    const orgId = getOrgId();
    if (!orgId) { setLoading(false); return; }
    try {
      const [found, ls] = await Promise.all([
        api(`/api/groups/${groupId}`),
        api(`/api/properties?orgId=${orgId}`),
      ]);
      if (!found?._id) { toast.error("Group not found"); router.push("/groups"); return; }
      setGroup(found as PropertyGroup);

      const rawListings = Array.isArray(ls) ? ls : ls?.properties ?? [];
      setListings(
        (rawListings as any[])
          .map((l) => ({ ...l, _id: String(l?._id ?? l?.id ?? "") }))
          .filter((l) => l._id.length > 0)
      );
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [groupId, router]);

  const loadRules = useCallback(async () => {
    setLoadingRules(true);
    try {
      const r = await api(`/api/groups/${groupId}/rules`);
      setRules(Array.isArray(r) ? r : []);
    } catch {
      toast.error("Failed to load rules");
    } finally {
      setLoadingRules(false);
    }
  }, [groupId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadRules(); }, [loadRules]);

  const handleDeleteGroup = async () => {
    if (!confirm(`Delete group "${group?.name}" and all its rules? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await api(`/api/groups/${groupId}`, { method: "DELETE" });
      toast.success("Group deleted");
      router.push("/groups");
    } catch (e: any) {
      toast.error(e.message);
      setDeleting(false);
    }
  };

  const memberListings = listings.filter((l) => group?.listingIds.includes(l._id));
  const filteredRules = rules.filter(
    (r) => (r.ruleCategory || fallbackCategoryFromRuleType(r.ruleType)) === activeRuleCategory
  );

  // ── Loading skeleton ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto animate-pulse space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-8 w-8 rounded-lg bg-surface-2" />
          <div className="h-5 w-32 rounded-lg bg-surface-2" />
          <div className="h-5 w-1 rounded bg-surface-2" />
          <div className="h-5 w-40 rounded-lg bg-surface-2" />
        </div>
        <div className="h-28 rounded-2xl bg-surface-1 border border-border-default" />
        <div className="h-48 rounded-2xl bg-surface-1 border border-border-default" />
        <div className="h-64 rounded-2xl bg-surface-1 border border-border-default" />
      </div>
    );
  }

  if (!group) return null;

  // ── Edit mode ─────────────────────────────────────────────────────────────────

  if (editing) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <button
          onClick={() => setEditing(false)}
          className="flex items-center gap-2 text-sm text-text-tertiary hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to group
        </button>
        <GroupForm
          initial={group}
          allListings={listings}
          onSave={(g) => { setGroup(g); setEditing(false); toast.success("Group updated"); }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  // ── Main page ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <button
        onClick={() => router.push("/groups")}
        className="flex items-center gap-1.5 text-sm text-text-tertiary hover:text-text-primary transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <Layers className="w-3.5 h-3.5" />
        All Groups
      </button>

      {/* Group header card */}
      <div className="rounded-2xl border border-border-default bg-surface-1 overflow-hidden">
        {/* Color top strip */}
        <div className="h-1.5" style={{ background: group.color }} />

        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${group.color}22`, border: `1.5px solid ${group.color}55` }}
              >
                <Layers className="w-5 h-5" style={{ color: group.color }} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-text-primary">{group.name}</h1>
                {group.description && (
                  <p className="text-sm text-text-tertiary mt-0.5">{group.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setEditing(true)}
              >
                <Pencil className="w-3.5 h-3.5" /> Edit group
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-red-500 hover:text-red-600 hover:border-red-300"
                onClick={handleDeleteGroup}
                disabled={deleting}
              >
                {deleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Delete
              </Button>
            </div>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-6 mt-5 pt-5 border-t border-border-subtle">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-text-tertiary" />
              </div>
              <div>
                <p className="text-lg font-bold text-text-primary">{memberListings.length}</p>
                <p className="text-xs text-text-tertiary">Properties</p>
              </div>
            </div>
            <div className="w-px h-10 bg-border-subtle" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center">
                <Settings2 className="w-4 h-4 text-text-tertiary" />
              </div>
              <div>
                <p className="text-lg font-bold text-text-primary">{rules.length}</p>
                <p className="text-xs text-text-tertiary">Group Rules</p>
              </div>
            </div>
            <div className="w-px h-10 bg-border-subtle" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4 text-text-tertiary" />
              </div>
              <div>
                <p className="text-lg font-bold text-text-primary">{rules.filter((r) => r.enabled).length}</p>
                <p className="text-xs text-text-tertiary">Active Rules</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Properties section */}
      <div className="rounded-2xl border border-border-default bg-surface-1 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="w-4 h-4 text-text-tertiary" />
          <h2 className="text-sm font-semibold text-text-primary">
            Properties in this group
          </h2>
          <span className="text-xs text-text-tertiary bg-surface-2 border border-border-subtle px-2 py-0.5 rounded-full ml-1">
            {memberListings.length}
          </span>
        </div>

        {memberListings.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-border-default rounded-xl">
            <Home className="w-6 h-6 text-text-tertiary mx-auto mb-2" />
            <p className="text-sm text-text-tertiary">No properties assigned yet.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 gap-1.5"
              onClick={() => setEditing(true)}
            >
              <Plus className="w-3.5 h-3.5" /> Add properties
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {memberListings.map((l) => (
              <div
                key={l._id}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border-default bg-surface-0 hover:bg-surface-2 transition-colors"
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${group.color}22` }}
                >
                  <Home className="w-3.5 h-3.5" style={{ color: group.color }} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{l.name}</p>
                  <p className="text-xs text-text-tertiary">
                    {l.area ?? "—"}{l.bedroomsNumber != null ? ` · ${l.bedroomsNumber}BR` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <GroupProfileOverrides
        group={group}
        onUpdated={(patch) => setGroup((prev) => (prev ? { ...prev, ...patch } : prev))}
      />

      {/* Rules section */}
      <div className="rounded-2xl border border-border-default bg-surface-1 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-text-tertiary" />
              <h2 className="text-sm font-semibold text-text-primary">Group Rules</h2>
              <span className="text-xs text-text-tertiary bg-surface-2 border border-border-subtle px-2 py-0.5 rounded-full ml-1">
                {rules.length} total
              </span>
            </div>
            <p className="text-xs text-text-tertiary mt-1.5 ml-6">
              Date and price rules for all {memberListings.length} properties. Profile overrides above
              handle MLOS / occupancy; unit settings still win when set.
            </p>
          </div>
          <Button
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={() => setShowRuleForm(true)}
          >
            <Plus className="w-3.5 h-3.5" /> Add rule
          </Button>
        </div>

        {/* Category tabs */}
        <Tabs
          value={activeRuleCategory}
          onValueChange={(v) => {
            setActiveRuleCategory(v as NonNullable<PricingRule["ruleCategory"]>);
            setShowRuleForm(false);
          }}
          className="mb-5"
        >
          <TabsList className="flex flex-wrap gap-1.5 h-auto bg-surface-2/60 p-1.5 rounded-xl border border-border-subtle">
            {(Object.entries(RULE_CATEGORY_LABELS) as [NonNullable<PricingRule["ruleCategory"]>, string][]).map(
              ([value, label]) => {
                const count = rules.filter(
                  (r) => (r.ruleCategory || fallbackCategoryFromRuleType(r.ruleType)) === value
                ).length;
                return (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className={cn(
                      "gap-1.5 text-xs font-semibold transition-all rounded-lg px-3 py-1.5 border relative",
                      activeRuleCategory === value
                        ? "bg-primary text-black border-primary shadow ring-2 ring-primary/30 scale-[1.02]"
                        : "bg-transparent text-muted-foreground border-transparent hover:bg-background hover:text-foreground"
                    )}
                  >
                    {label}
                    {count > 0 && (
                      <span
                        className={cn(
                          "ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none",
                          activeRuleCategory === value
                            ? "bg-black/20 text-black"
                            : "bg-surface-2 text-text-tertiary"
                        )}
                      >
                        {count}
                      </span>
                    )}
                  </TabsTrigger>
                );
              }
            )}
          </TabsList>
        </Tabs>

        {/* Rules list */}
        {loadingRules ? (
          <div className="flex items-center gap-2 text-xs text-text-tertiary py-4">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading rules…
          </div>
        ) : (
          <div className="space-y-2">
            {filteredRules.map((r) => (
              <RuleRow
                key={r._id}
                rule={r}
                groupId={groupId}
                onToggle={(updated) =>
                  setRules((prev) => prev.map((x) => (x._id === updated._id ? updated : x)))
                }
                onDelete={(id) => setRules((prev) => prev.filter((x) => x._id !== id))}
              />
            ))}
            {filteredRules.length === 0 && !showRuleForm && (
              <div className="py-8 text-center border border-dashed border-border-default rounded-xl">
                <p className="text-sm text-text-tertiary">
                  No {RULE_CATEGORY_LABELS[activeRuleCategory].toLowerCase()} rules yet.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 gap-1.5"
                  onClick={() => setShowRuleForm(true)}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add {RULE_CATEGORY_LABELS[activeRuleCategory]} rule
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Add rule form */}
        {showRuleForm && (
          <div className="mt-4">
            <AddRuleForm
              groupId={groupId}
              initialCategory={activeRuleCategory}
              onAdded={(r) => {
                setRules((prev) => [...prev, r]);
                setShowRuleForm(false);
              }}
              onCancel={() => setShowRuleForm(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

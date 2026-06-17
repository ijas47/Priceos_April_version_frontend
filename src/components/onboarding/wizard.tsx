"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2, ArrowRight, ArrowLeft, Globe2, Building2, Key,
  Zap, RefreshCw, Home, Check, X, Sparkles, TrendingUp, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PricingRulesStudio } from "@/components/pricing/pricing-rules-studio";

// ── Types ──────────────────────────────────────────────────────────────────────

type WizardStep = "connect" | "select" | "market" | "strategy" | "complete";
type StrategyMode = "conservative" | "balanced" | "aggressive";

interface PricingDefaults {
  weekendUpliftPct: number;
  lastMinuteDiscountPct: number;
  farOutMarkupPct: number;
}

type RuleSetupMode = "individual" | "group" | "default";

interface GroupRuleDraft {
  ruleType: "SEASON" | "EVENT" | "ADMIN_BLOCK" | "LOS_DISCOUNT";
  ruleCategory?: "GUARDRAILS" | "SEASONS" | "LEAD_TIME" | "GAP_LOGIC" | "LOS_DISCOUNTS" | "DATE_OVERRIDES" | "OCCUPANCY";
  name: string;
  priceAdjPct?: number;
  startDate?: string;
  endDate?: string;
}

interface GroupDraft {
  name: string;
  listingIds: string[];
  color: string;
}

interface Listing {
  id: string;
  name: string;
  bedrooms: number;
  city: string;
  type: string;
  thumbnail: string | null;
}

interface MarketTemplate {
  code: string;
  name: string;
  country: string;
  currency: string;
  flag: string;
  weekend: string;
  maxChangePct: number;
}

// ── Market Templates ───────────────────────────────────────────────────────────

const MARKETS: MarketTemplate[] = [
  { code: "UAE_DXB", name: "Dubai", country: "UAE", currency: "AED", flag: "🇦🇪", weekend: "Thu–Fri", maxChangePct: 15 },
  { code: "GBR_LON", name: "London", country: "UK", currency: "GBP", flag: "🇬🇧", weekend: "Fri–Sat", maxChangePct: 10 },
  { code: "USA_NYC", name: "New York", country: "USA", currency: "USD", flag: "🇺🇸", weekend: "Fri–Sat", maxChangePct: 12 },
  { code: "FRA_PAR", name: "Paris", country: "France", currency: "EUR", flag: "🇫🇷", weekend: "Fri–Sat", maxChangePct: 10 },
  { code: "NLD_AMS", name: "Amsterdam", country: "Netherlands", currency: "EUR", flag: "🇳🇱", weekend: "Fri–Sat", maxChangePct: 10 },
  { code: "ESP_BCN", name: "Barcelona", country: "Spain", currency: "EUR", flag: "🇪🇸", weekend: "Fri–Sat", maxChangePct: 12 },
  { code: "USA_MIA", name: "Miami", country: "USA", currency: "USD", flag: "🇺🇸", weekend: "Fri–Sat", maxChangePct: 20 },
  { code: "PRT_LIS", name: "Lisbon", country: "Portugal", currency: "EUR", flag: "🇵🇹", weekend: "Fri–Sat", maxChangePct: 12 },
  { code: "USA_NSH", name: "Nashville", country: "USA", currency: "USD", flag: "🇺🇸", weekend: "Fri–Sat", maxChangePct: 20 },
  { code: "AUS_SYD", name: "Sydney", country: "Australia", currency: "AUD", flag: "🇦🇺", weekend: "Fri–Sat", maxChangePct: 15 },
];

// ── Demo Listings (for client demos - no API key needed) ───────────────────────

const DEMO_LISTINGS: Listing[] = [
  { id: "demo-1", name: "Luxury Marina View Suite",         bedrooms: 2, city: "Dubai Marina",      type: "apartment",  thumbnail: null },
  { id: "demo-2", name: "Downtown Burj Khalifa Studio",     bedrooms: 1, city: "Downtown Dubai",    type: "studio",     thumbnail: null },
  { id: "demo-3", name: "JBR Beachfront 3BR Villa",         bedrooms: 3, city: "JBR",               type: "villa",      thumbnail: null },
  { id: "demo-4", name: "Palm Jumeirah Signature Villa",    bedrooms: 5, city: "Palm Jumeirah",     type: "villa",      thumbnail: null },
  { id: "demo-5", name: "Business Bay Executive Studio",    bedrooms: 1, city: "Business Bay",      type: "studio",     thumbnail: null },
  { id: "demo-6", name: "Dubai Hills Garden Apartment",     bedrooms: 2, city: "Dubai Hills",       type: "apartment",  thumbnail: null },
  { id: "demo-7", name: "DIFC Premium 1BR Apartment",       bedrooms: 1, city: "DIFC",              type: "apartment",  thumbnail: null },
  { id: "demo-8", name: "Meydan Racecourse View Penthouse", bedrooms: 4, city: "Meydan",            type: "penthouse",  thumbnail: null },
];

const STEPS: { id: WizardStep; label: string; icon: React.ElementType }[] = [
  { id: "connect",  label: "Connect",  icon: Key },
  { id: "select",   label: "Select",   icon: Home },
  { id: "market",   label: "Market",   icon: Globe2 },
  { id: "strategy", label: "Strategy", icon: Sparkles },
  { id: "complete", label: "Complete", icon: CheckCircle2 },
];

// ── Helper ─────────────────────────────────────────────────────────────────────
async function saveProgress(data: Partial<{
  step: WizardStep;
  selectedListingIds: string[];
  activatedListingIds: string[];
  marketCode: string;
  listings: Listing[];
  strategy: StrategyMode;
  pricingDefaults: PricingDefaults;
  ruleSetupMode: RuleSetupMode;
  groupRuleDrafts: GroupRuleDraft[];
  groupRuleDraftsByGroup: GroupRuleDraft[][];
  groupDrafts: GroupDraft[];
}>) {
  await fetch("/api/onboarding", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// ── Step Components ────────────────────────────────────────────────────────────

function StepConnect({ onNext }: { onNext: (listings: Listing[]) => void }) {
  const [accountId, setAccountId] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [fallbackListings, setFallbackListings] = useState<Listing[] | null>(null);

  const handleValidate = async () => {
    if (!accountId.trim()) { toast.error("Please enter your Hostaway Account ID"); return; }
    if (!apiSecret.trim()) { toast.error("Please enter your Hostaway API Secret"); return; }
    setLoading(true);
    setFallbackReason(null);
    setFallbackListings(null);
    try {
      const params = new URLSearchParams({
        accountId: accountId.trim(),
        apiSecret: apiSecret.trim(),
      });
      const res = await fetch(`/api/hostaway/metadata?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || data.message || "Connection failed");

      if (data?.success && data?.mode === "real") {
        toast.success(`✅ Connected! Found ${data.total} properties.`);
        onNext(data.listings);
        return;
      }

      if (data?.mode === "fallback_available" && Array.isArray(data?.listings)) {
        setFallbackReason(data.reason || "Real Hostaway connection failed.");
        setFallbackListings(data.listings);
        toast.warning("Real connection failed. Demo fallback is available.");
        return;
      }

      throw new Error(data?.reason || data?.message || "Connection failed");
    } catch (e: unknown) {
      toast.error((e as Error).message || "Could not connect to Hostaway");
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = async () => {
    setDemoLoading(true);
    // Simulate a brief "loading" for realism
    await new Promise(r => setTimeout(r, 900));
    toast.success("🎮 Demo mode - 8 sample properties loaded");
    onNext(DEMO_LISTINGS);
    setDemoLoading(false);
  };

  return (
    <div className="space-y-6">
      {/* Demo Mode Banner */}
      <div
        className="flex items-center justify-between p-4 rounded-xl border border-dashed border-primary/30 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-all group"
        onClick={handleDemo}
      >
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">Try Demo Mode</p>
            <p className="text-xs text-zinc-500">8 sample properties - no API key needed</p>
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); handleDemo(); }}
          disabled={demoLoading}
          className="h-8 px-4 text-xs font-bold bg-primary hover:bg-primary disabled:opacity-50 text-black rounded-lg flex items-center gap-1.5 transition-all shrink-0"
        >
          {demoLoading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
          {demoLoading ? "Loading…" : "Launch Demo"}
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-zinc-800" />
        <span className="text-xs text-zinc-600 font-medium">or connect your account</span>
        <div className="h-px flex-1 bg-zinc-800" />
      </div>

      <div className="flex items-center gap-4 p-5 rounded-2xl bg-zinc-900 border border-zinc-800">
        <div className="h-12 w-12 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0">
          <Key className="h-5 w-5 text-zinc-400" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white mb-0.5">Connect Hostaway</h3>
          <p className="text-xs text-zinc-500 leading-relaxed">
            PriceOS fetches <strong className="text-zinc-300">only your property names</strong> - no pricing, no reservations yet.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Account ID */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Hostaway Account ID
          </label>
          <div className="relative">
            <input
              type="text"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleValidate()}
              placeholder="145065"
              className="w-full h-12 bg-zinc-900 border border-zinc-700 rounded-xl px-4 pr-12 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 font-mono"
            />
            {accountId && (
              <button onClick={() => setAccountId("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="text-xs text-zinc-600">
            Hostaway → Settings → Account → Account ID (numeric)
          </p>
        </div>

        {/* API Secret */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Hostaway API Secret
          </label>
          <div className="relative">
            <input
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleValidate()}
              placeholder="••••••••••••••••••••••••••••••••"
              className="w-full h-12 bg-zinc-900 border border-zinc-700 rounded-xl px-4 pr-12 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 font-mono"
            />
            {apiSecret && (
              <button onClick={() => setApiSecret("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="text-xs text-zinc-600">
            Hostaway → Settings → API Keys → Create new key → copy the <strong className="text-zinc-400">Client Secret</strong>
          </p>
        </div>
      </div>

      <button
        onClick={handleValidate}
        disabled={loading || !accountId.trim() || !apiSecret.trim()}
        className="w-full h-12 bg-primary hover:bg-primary disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold rounded-xl flex items-center justify-center gap-2 transition-all"
      >
        {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
        {loading ? "Connecting…" : "Validate & Fetch Properties"}
      </button>

      {fallbackListings && fallbackReason && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 space-y-3">
          <p className="text-xs text-primary/80 font-semibold">Real connection failed</p>
          <p className="text-xs text-zinc-300 leading-relaxed">{fallbackReason}</p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleValidate}
              disabled={loading}
              className="h-9 px-4 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs font-semibold"
            >
              Retry Real Connection
            </button>
            <button
              onClick={() => {
                toast.success("Continuing with demo listings.");
                onNext(fallbackListings);
              }}
              className="h-9 px-4 rounded-lg bg-primary hover:bg-primary text-black text-xs font-bold"
            >
              Continue with Demo Listings
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          { icon: "🔒", text: "Key stored encrypted" },
          { icon: "⚡", text: "~1 API call only" },
          { icon: "✅", text: "Read-only access" },
        ].map((item) => (
          <div key={item.text} className="p-3 rounded-xl bg-zinc-900 border border-zinc-800">
            <div className="text-xl mb-1">{item.icon}</div>
            <p className="text-[11px] text-zinc-500">{item.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepSelect({ listings, onNext }: { listings: Listing[]; onNext: (ids: string[]) => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    setSelected(selected.size === listings.length ? new Set() : new Set(listings.map(l => l.id)));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">Select which properties PriceOS should manage:</p>
        <button onClick={toggleAll} className="text-xs text-primary hover:text-primary/80 font-semibold">
          {selected.size === listings.length ? "Deselect all" : "Select all"}
        </button>
      </div>

      <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
        {listings.length === 0 ? (
          <div className="text-center py-12 text-zinc-600">
            <Home className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No properties found. Check your API key.</p>
          </div>
        ) : listings.map((listing) => {
          const isSelected = selected.has(listing.id);
          return (
            <button
              key={listing.id}
              onClick={() => toggle(listing.id)}
              className={cn(
                "w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all",
                isSelected
                  ? "border-primary/40 bg-primary/5"
                  : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
              )}
            >
              <div className={cn(
                "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                isSelected ? "bg-primary text-black" : "bg-zinc-800 text-zinc-500"
              )}>
                {isSelected ? <Check className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm font-semibold truncate", isSelected ? "text-white" : "text-zinc-300")}>
                  {listing.name}
                </p>
                <p className="text-xs text-zinc-600">
                  {listing.bedrooms > 0 ? `${listing.bedrooms} BR` : listing.type} · {listing.city || "Unknown location"}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
        <span className="text-sm text-zinc-500">
          <span className="text-primary font-bold">{selected.size}</span> of {listings.length} selected
        </span>
        <button
          onClick={() => onNext(Array.from(selected))}
          disabled={selected.size === 0}
          className="h-10 px-6 bg-primary hover:bg-primary disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold rounded-xl flex items-center gap-2 text-sm transition-all"
        >
          Next <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function StepMarket({ initialMarket, onNext }: { initialMarket: string; onNext: (code: string) => void }) {
  const [selected, setSelected] = useState(initialMarket || "UAE_DXB");

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <p className="text-sm text-zinc-300 font-medium">Select your primary operating market</p>
        <p className="text-xs text-zinc-500 leading-relaxed">
          This pre-loads a <strong className="text-zinc-300">city-specific pricing rulebook</strong> - public holidays, 
          peak seasons, local events, weekend pattern, and daily price-change guardrails.
          You can customise any rule after setup.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
        {MARKETS.map((m) => (
          <button
            key={m.code}
            onClick={() => setSelected(m.code)}
            className={cn(
              "flex items-center gap-3 p-3 rounded-xl border text-left transition-all",
              selected === m.code
                ? "border-primary/40 bg-primary/5"
                : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
            )}
          >
            <span className="text-2xl">{m.flag}</span>
            <div className="min-w-0">
              <p className={cn("text-sm font-semibold", selected === m.code ? "text-white" : "text-zinc-300")}>
                {m.name}
              </p>
              <p className="text-[11px] text-zinc-600">{m.currency} · {m.weekend}</p>
            </div>
          </button>
        ))}
      </div>

      {selected && (() => {
        const m = MARKETS.find(x => x.code === selected)!;
        return (
          <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: "Currency", value: m.currency },
                { label: "Weekend", value: m.weekend },
                { label: "Max Price Swing", value: `${m.maxChangePct}%/day` },
              ].map(item => (
                <div key={item.label}>
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">{item.label}</p>
                  <p className="text-sm font-bold text-primary">{item.value}</p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-zinc-600 leading-relaxed">
              <strong className="text-zinc-500">Max price swing</strong> = the largest single-day price change Aria is 
              allowed to make automatically. Larger moves go to your Proposals inbox for approval.
            </p>
          </div>
        );
      })()}

      <button
        onClick={() => onNext(selected)}
        className="w-full h-12 bg-primary hover:bg-primary text-black font-bold rounded-xl flex items-center justify-center gap-2 transition-all text-sm"
      >
        Apply Market Template <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Strategy mode definitions ──────────────────────────────────────────────────

const STRATEGY_OPTIONS: {
  mode: StrategyMode;
  label: string;
  tagline: string;
  autoApprove: number;
  maxChangePct: (marketMax: number) => number;
  floorMultiplier: number;
  color: string;
  border: string;
  bg: string;
  badge: string;
}[] = [
  {
    mode: "conservative",
    label: "Conservative",
    tagline: "Safer moves, human reviews most changes",
    autoApprove: 3,
    maxChangePct: (m) => Math.round(m * 0.7),
    floorMultiplier: 0.6,
    color: "text-blue-400",
    border: "border-blue-500/30",
    bg: "bg-blue-500/5",
    badge: "Recommended for new users",
  },
  {
    mode: "balanced",
    label: "Balanced",
    tagline: "Market defaults, steady automation",
    autoApprove: 5,
    maxChangePct: (m) => m,
    floorMultiplier: 0.5,
    color: "text-primary",
    border: "border-primary/30",
    bg: "bg-primary/5",
    badge: "Most popular",
  },
  {
    mode: "aggressive",
    label: "Aggressive",
    tagline: "Max automation, larger swings allowed",
    autoApprove: 10,
    maxChangePct: (m) => Math.round(m * 1.5),
    floorMultiplier: 0.4,
    color: "text-rose-400",
    border: "border-rose-500/30",
    bg: "bg-rose-500/5",
    badge: "For experienced managers",
  },
];

function StepStrategy({
  listings,
  selectedIds,
  marketCode,
  strategy,
  pricingDefaults,
  onPricingDefaultsChange,
  ruleSetupMode,
  onRuleSetupModeChange,
  groupRuleDrafts,
  groupRuleDraftsByGroup,
  onGroupRuleDraftsByGroupChange,
  onGroupRuleDraftsChange,
  groupDrafts,
  onGroupDraftsChange,
  onStrategyChange,
  onActivate,
}: {
  listings: Listing[];
  selectedIds: string[];
  marketCode: string;
  strategy: StrategyMode;
  pricingDefaults: PricingDefaults;
  onPricingDefaultsChange: (patch: Partial<PricingDefaults>) => void;
  ruleSetupMode: RuleSetupMode;
  onRuleSetupModeChange: (mode: RuleSetupMode) => void;
  groupRuleDrafts: GroupRuleDraft[];
  groupRuleDraftsByGroup: GroupRuleDraft[][];
  onGroupRuleDraftsByGroupChange: (next: GroupRuleDraft[][]) => void;
  onGroupRuleDraftsChange: (next: GroupRuleDraft[]) => void;
  groupDrafts: GroupDraft[];
  onGroupDraftsChange: (next: GroupDraft[]) => void;
  onStrategyChange: (s: StrategyMode) => void;
  onActivate: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Activating pricing engine...");
  const market = MARKETS.find(m => m.code === marketCode) ?? MARKETS[0];
  const selected = STRATEGY_OPTIONS.find(s => s.mode === strategy) ?? STRATEGY_OPTIONS[0];
  const selectedListings = listings.filter((l) => selectedIds.includes(l.id));
  const selectedListingOptions = selectedListings.map((l) => ({
    id: l.id,
    name: l.name,
    currencyCode: market.currency,
  }));

  const toggleGroupListing = (groupIdx: number, listingId: string) => {
    const next = [...groupDrafts];
    const set = new Set(next[groupIdx]?.listingIds ?? []);
    if (set.has(listingId)) set.delete(listingId);
    else set.add(listingId);
    next[groupIdx] = { ...next[groupIdx], listingIds: Array.from(set) };
    onGroupDraftsChange(next);
  };

  const addGroupDraft = () => {
    const next = [
      ...groupDrafts,
      { name: `Group ${groupDrafts.length + 1}`, listingIds: [], color: "#8b5cf6" },
    ];
    onGroupDraftsChange(next);
    onGroupRuleDraftsByGroupChange([...(groupRuleDraftsByGroup || []), []]);
  };

  const removeGroupDraft = (idx: number) => {
    const next = groupDrafts.filter((_, i) => i !== idx);
    onGroupDraftsChange(next);
    onGroupRuleDraftsByGroupChange((groupRuleDraftsByGroup || []).filter((_, i) => i !== idx));
  };

  const buildGroupsBy = (mode: "city" | "type" | "city_type") => {
    const bucket = new Map<string, string[]>();
    for (const l of selectedListings) {
      const city = l.city || "Unknown";
      const typeLabel =
        l.bedrooms > 0 ? `${l.bedrooms}BR` : l.type?.toUpperCase() || "Studio";
      const key =
        mode === "city"
          ? city
          : mode === "type"
          ? typeLabel
          : `${city} · ${typeLabel}`;
      if (!bucket.has(key)) bucket.set(key, []);
      bucket.get(key)!.push(l.id);
    }
    const generated = Array.from(bucket.entries()).map(([name, listingIds]) => ({
      name: `${name} Group`,
      listingIds,
      color: "#8b5cf6",
    }));
    onGroupDraftsChange(generated);
    onGroupRuleDraftsByGroupChange(generated.map(() => []));
  };

  const addGroupRuleDraft = () => {
    onGroupRuleDraftsChange([
      ...groupRuleDrafts,
      { ruleType: "SEASON", ruleCategory: "SEASONS", name: "Group Rule", priceAdjPct: 0 },
    ]);
  };

  const updateGroupRuleDraft = (idx: number, patch: Partial<GroupRuleDraft>) => {
    const next = [...groupRuleDrafts];
    next[idx] = { ...next[idx], ...patch };
    onGroupRuleDraftsChange(next);
  };

  const removeGroupRuleDraft = (idx: number) => {
    onGroupRuleDraftsChange(groupRuleDrafts.filter((_, i) => i !== idx));
  };
  const CATEGORY_TO_RULE_TYPE: Record<string, GroupRuleDraft["ruleType"]> = {
    GUARDRAILS: "EVENT",
    SEASONS: "SEASON",
    LEAD_TIME: "EVENT",
    GAP_LOGIC: "EVENT",
    LOS_DISCOUNTS: "LOS_DISCOUNT",
    DATE_OVERRIDES: "ADMIN_BLOCK",
    OCCUPANCY: "EVENT",
  };
  const addRuleForGroup = (groupIdx: number) => {
    const next = [...(groupRuleDraftsByGroup || [])];
    const current = next[groupIdx] || [];
    next[groupIdx] = [...current, { ruleType: "SEASON", ruleCategory: "SEASONS", name: "Group Rule", priceAdjPct: 0 }];
    onGroupRuleDraftsByGroupChange(next);
  };
  const updateRuleForGroup = (groupIdx: number, ruleIdx: number, patch: Partial<GroupRuleDraft>) => {
    const next = [...(groupRuleDraftsByGroup || [])];
    const current = [...(next[groupIdx] || [])];
    current[ruleIdx] = { ...current[ruleIdx], ...patch };
    next[groupIdx] = current;
    onGroupRuleDraftsByGroupChange(next);
  };
  const removeRuleForGroup = (groupIdx: number, ruleIdx: number) => {
    const next = [...(groupRuleDraftsByGroup || [])];
    next[groupIdx] = (next[groupIdx] || []).filter((_, i) => i !== ruleIdx);
    onGroupRuleDraftsByGroupChange(next);
  };

  useEffect(() => {
    if (!loading) {
      setLoadingMessage("Activating pricing engine...");
      return;
    }
    const phases = [
      "Syncing calendar baseline...",
      "Applying strategy guardrails...",
      "Seeding market intelligence...",
      "Finalizing your portfolio setup...",
    ];
    let idx = 0;
    setLoadingMessage(phases[idx]);
    const timer = setInterval(() => {
      idx = (idx + 1) % phases.length;
      setLoadingMessage(phases[idx]);
    }, 2200);
    return () => clearInterval(timer);
  }, [loading]);

  const handleActivate = async () => {
    setLoading(true);
    try {
      await onActivate();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-bold text-white">Choose your pricing strategy</p>
          <p className="text-xs text-zinc-500">
            {selectedIds.length} {selectedIds.length === 1 ? "property" : "properties"} · {market.name} market
          </p>
        </div>
      </div>

      {/* Strategy cards */}
      <div className="space-y-2">
        {STRATEGY_OPTIONS.map((opt) => {
          const isSelected = strategy === opt.mode;
          const effectiveMax = opt.maxChangePct(market.maxChangePct);
          return (
            <button
              key={opt.mode}
              onClick={() => onStrategyChange(opt.mode)}
              className={cn(
                "w-full p-4 rounded-xl border text-left transition-all",
                isSelected ? `${opt.border} ${opt.bg}` : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className={cn("text-sm font-bold", isSelected ? opt.color : "text-zinc-300")}>
                      {opt.label}
                    </p>
                    {isSelected && (
                      <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", opt.bg, opt.color, opt.border, "border")}>
                        SELECTED
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 mb-2">{opt.tagline}</p>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="text-zinc-600">
                      Auto-approve <span className={cn("font-bold", isSelected ? opt.color : "text-zinc-400")}>&lt;{opt.autoApprove}%</span>
                    </span>
                    <span className="text-zinc-700">·</span>
                    <span className="text-zinc-600">
                      Max swing <span className={cn("font-bold", isSelected ? opt.color : "text-zinc-400")}>{effectiveMax}%/day</span>
                    </span>
                    <span className="text-zinc-700">·</span>
                    <span className="text-zinc-600">
                      Floor <span className={cn("font-bold", isSelected ? opt.color : "text-zinc-400")}>{Math.round(opt.floorMultiplier * 100)}%</span>
                    </span>
                  </div>
                </div>
                <div className={cn(
                  "h-5 w-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center transition-all",
                  isSelected ? `${opt.border} ${opt.bg}` : "border-zinc-700"
                )}>
                  {isSelected && <div className={cn("h-2 w-2 rounded-full", opt.color.replace("text-", "bg-"))} />}
                </div>
              </div>
              {opt.badge && isSelected && (
                <p className={cn("text-[10px] mt-2 font-medium", opt.color)}>{opt.badge}</p>
              )}
            </button>
          );
        })}
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: TrendingUp, label: "Seasonal Engine", desc: "12-month demand patterns loaded", color: "text-green-400", bg: "bg-green-500/5 border-green-500/15" },
          { icon: Shield, label: "Guardrails", desc: `Max ${selected.maxChangePct(market.maxChangePct)}%/day change`, color: selected.color, bg: `${selected.bg} ${selected.border}` },
          { icon: Zap, label: "Auto-Approve", desc: `Changes <${selected.autoApprove}% push live`, color: "text-primary", bg: "bg-primary/5 border-primary/15" },
        ].map(item => (
          <div key={item.label} className={cn("p-3 rounded-xl border text-center", item.bg)}>
            <item.icon className={cn("h-4 w-4 mx-auto mb-1.5", item.color)} />
            <p className={cn("text-[10px] font-bold mb-0.5", item.color)}>{item.label}</p>
            <p className="text-[10px] text-zinc-600 leading-tight">{item.desc}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
        <p className="text-xs font-bold text-white">Choose one rules setup mode</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {[
            { id: "individual" as RuleSetupMode, label: "1) Individual", desc: "Set rules property by property" },
            { id: "group" as RuleSetupMode, label: "2) Group Rules", desc: "Set one rule set per group" },
            { id: "default" as RuleSetupMode, label: "3) Use Defaults", desc: "Use market defaults and go live fast" },
          ].map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onRuleSetupModeChange(m.id)}
              className={cn(
                "rounded-lg border px-3 py-3 text-left",
                ruleSetupMode === m.id
                  ? "border-primary bg-primary/10"
                  : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
              )}
            >
              <p className="text-xs font-semibold text-white">{m.label}</p>
              <p className="text-[11px] text-zinc-400 mt-1">{m.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {ruleSetupMode === "individual" && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
          <p className="text-xs font-bold text-white">Pricing Rules (same fields as Pricing page)</p>
          <p className="text-[11px] text-zinc-500">
            Configure Guardrails, Seasons, Lead Time, Gap Logic, LOS Discounts, Date Overrides, and Occupancy exactly like Pricing Rules Studio.
          </p>
          <PricingRulesStudio listings={selectedListingOptions} />
        </div>
      )}

      {ruleSetupMode === "group" && (
        <>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-white">Grouping</p>
              <button
                type="button"
                onClick={addGroupDraft}
                className="text-[11px] px-2 py-1 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                Add group
              </button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button type="button" onClick={() => buildGroupsBy("city")} className="text-[11px] px-2 py-1 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800">Auto by location</button>
              <button type="button" onClick={() => buildGroupsBy("type")} className="text-[11px] px-2 py-1 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800">Auto by type (1BR/2BR)</button>
              <button type="button" onClick={() => buildGroupsBy("city_type")} className="text-[11px] px-2 py-1 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800">Auto by location + type</button>
            </div>
            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
              {groupDrafts.length === 0 && (
                <p className="text-[11px] text-zinc-600">No groups configured.</p>
              )}
              {groupDrafts.map((g, idx) => (
                <div key={`${g.name}-${idx}`} className="rounded-lg border border-zinc-800 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      value={g.name}
                      onChange={(e) => {
                        const next = [...groupDrafts];
                        next[idx] = { ...next[idx], name: e.target.value };
                        onGroupDraftsChange(next);
                      }}
                      className="flex-1 h-8 bg-zinc-950 border border-zinc-700 rounded px-2 text-xs text-white"
                      placeholder="Group name"
                    />
                    <button type="button" onClick={() => removeGroupDraft(idx)} className="text-zinc-500 hover:text-zinc-300">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-1 max-h-28 overflow-y-auto">
                    {selectedListings.map((l) => (
                      <label key={`${g.name}-${l.id}`} className="text-[11px] text-zinc-400 flex items-center gap-2">
                        <input type="checkbox" checked={g.listingIds.includes(l.id)} onChange={() => toggleGroupListing(idx, l.id)} />
                        <span className="truncate">{l.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-white">Group Rules (same as Groups section)</p>
            </div>
            {groupDrafts.length === 0 ? (
              <p className="text-[11px] text-zinc-500">Create groups first, then set rules per group.</p>
            ) : (
              <div className="space-y-3">
                {groupDrafts.map((g, groupIdx) => {
                  const rulesForGroup = groupRuleDraftsByGroup[groupIdx] || [];
                  return (
                    <div key={`${g.name}-${groupIdx}`} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-white truncate">{g.name}</p>
                        <button
                          type="button"
                          onClick={() => addRuleForGroup(groupIdx)}
                          className="text-[11px] px-2 py-1 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                        >
                          Add rule
                        </button>
                      </div>
                      {rulesForGroup.length === 0 ? (
                        <p className="text-[11px] text-zinc-500">No rules yet for this group.</p>
                      ) : (
                        <div className="space-y-2">
                          {rulesForGroup.map((r, idx) => (
                            <div key={`${g.name}-${r.name}-${idx}`} className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <select
                                  value={r.ruleCategory || "SEASONS"}
                                  onChange={(e) => {
                                    const category = e.target.value as NonNullable<GroupRuleDraft["ruleCategory"]>;
                                    updateRuleForGroup(groupIdx, idx, {
                                      ruleCategory: category,
                                      ruleType: CATEGORY_TO_RULE_TYPE[category],
                                    });
                                  }}
                                  className="h-8 bg-zinc-950 border border-zinc-700 rounded px-2 text-xs text-white"
                                >
                                  <option value="GUARDRAILS">Guardrails</option>
                                  <option value="SEASONS">Seasons</option>
                                  <option value="LEAD_TIME">Lead Time</option>
                                  <option value="GAP_LOGIC">Gap Logic</option>
                                  <option value="LOS_DISCOUNTS">LOS Discounts</option>
                                  <option value="DATE_OVERRIDES">Date Overrides</option>
                                  <option value="OCCUPANCY">Occupancy</option>
                                </select>
                                <input
                                  value={r.name}
                                  onChange={(e) => updateRuleForGroup(groupIdx, idx, { name: e.target.value })}
                                  className="h-8 bg-zinc-950 border border-zinc-700 rounded px-2 text-xs text-white"
                                  placeholder="Rule name"
                                />
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="min-w-0 space-y-1">
                                  <label className="text-[11px] text-zinc-500 block">Price adjustment %</label>
                                  <input
                                    type="number"
                                    value={r.priceAdjPct ?? 0}
                                    onChange={(e) => updateRuleForGroup(groupIdx, idx, { priceAdjPct: Number(e.target.value || 0) })}
                                    className="h-8 w-full min-w-0 bg-zinc-950 border border-zinc-700 rounded px-2 text-xs text-white"
                                    placeholder="e.g. 10"
                                  />
                                </div>
                                <div className="min-w-0 space-y-1">
                                  <label className="text-[11px] text-zinc-500 block">Start date</label>
                                  <input
                                    type="date"
                                    value={r.startDate || ""}
                                    onChange={(e) => updateRuleForGroup(groupIdx, idx, { startDate: e.target.value || undefined })}
                                    className="h-8 w-full min-w-0 bg-zinc-950 border border-zinc-700 rounded px-2 text-xs text-white"
                                  />
                                </div>
                                <div className="min-w-0 space-y-1">
                                  <label className="text-[11px] text-zinc-500 block">End date</label>
                                  <input
                                    type="date"
                                    value={r.endDate || ""}
                                    onChange={(e) => updateRuleForGroup(groupIdx, idx, { endDate: e.target.value || undefined })}
                                    className="h-8 w-full min-w-0 bg-zinc-950 border border-zinc-700 rounded px-2 text-xs text-white"
                                  />
                                </div>
                              </div>
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => removeRuleForGroup(groupIdx, idx)}
                                  className="text-[11px] px-2 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {ruleSetupMode === "default" && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs font-bold text-white mb-1">Using Default Rules</p>
          <p className="text-[11px] text-zinc-500">
            PriceOS will apply market template defaults + selected strategy guardrails. You can edit rules later in Pricing and Groups.
          </p>
        </div>
      )}

      <button
        onClick={handleActivate}
        disabled={loading}
        className="w-full h-12 bg-primary hover:bg-primary disabled:opacity-60 text-black font-bold rounded-xl flex items-center justify-center gap-2 transition-all text-sm"
      >
        {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
        {loading ? "Activating Pricing Engine…" : `Go Live - ${selected.label} Strategy`}
      </button>

      {loading && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
          <p className="text-xs font-semibold text-primary/80">Working in background</p>
          <p className="text-xs text-zinc-400 mt-1">{loadingMessage}</p>
        </div>
      )}

      <p className="text-center text-xs text-zinc-600">
        Strategy cards stay the same. Choose exactly one setup path above.
      </p>
    </div>
  );
}

function StepComplete({ onGoToDashboard }: { onGoToDashboard: () => void }) {
  const [setupStatus, setSetupStatus] = useState<"running" | "done" | "error">("running");

  useEffect(() => {
    const timer = setTimeout(() => setSetupStatus("done"), 8000);
    return () => clearTimeout(timer);
  }, []);

  const items = [
    { done: true, text: "PMS connected" },
    { done: true, text: "Market template loaded" },
    { done: true, text: "Guardrails auto-configured" },
    { done: true, text: "Seasonal rules created" },
    { done: true, text: "Weekend & lead-time pricing set" },
    { done: setupStatus === "done", text: setupStatus === "done" ? "Pricing engine complete" : "Pricing engine running..." },
  ];

  return (
    <div className="text-center space-y-8 py-4">
      <div className="relative mx-auto w-24 h-24">
        <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
        <div className="relative h-24 w-24 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center">
          <CheckCircle2 className="h-10 w-10 text-primary" />
        </div>
      </div>

      <div>
        <h3 className="text-2xl font-bold text-white mb-2">You&apos;re live on PriceOS</h3>
        <p className="text-zinc-400 text-sm max-w-xs mx-auto">
          Everything is auto-configured from market data. Review and customize any time from Settings.
        </p>
      </div>

      <div className="space-y-2 text-left max-w-xs mx-auto">
        {items.map(item => (
          <div key={item.text} className="flex items-center gap-2.5 text-xs text-zinc-400">
            {item.done ? (
              <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 text-primary animate-spin shrink-0" />
            )}
            <span className={item.done ? "text-zinc-300" : "text-primary/80"}>{item.text}</span>
          </div>
        ))}
      </div>

      <button
        onClick={onGoToDashboard}
        className="w-full max-w-xs mx-auto h-12 bg-primary hover:bg-primary text-black font-bold rounded-xl flex items-center justify-center gap-2 transition-all text-sm"
      >
        Go to Dashboard <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Main Wizard ────────────────────────────────────────────────────────────────

export function OnboardingWizard({ initialStep = "connect" }: { initialStep?: WizardStep }) {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(initialStep);
  const [listings, setListings] = useState<Listing[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [marketCode, setMarketCode] = useState("UAE_DXB");
  const [strategy, setStrategy] = useState<StrategyMode>("conservative");
  const [pricingDefaults, setPricingDefaults] = useState<PricingDefaults>({
    weekendUpliftPct: 20,
    lastMinuteDiscountPct: 10,
    farOutMarkupPct: 5,
  });
  const [ruleSetupMode, setRuleSetupMode] = useState<RuleSetupMode>("default");
  const [groupRuleDrafts, setGroupRuleDrafts] = useState<GroupRuleDraft[]>([]);
  const [groupRuleDraftsByGroup, setGroupRuleDraftsByGroup] = useState<GroupRuleDraft[][]>([]);
  const [groupDrafts, setGroupDrafts] = useState<GroupDraft[]>([]);
  const currentIndex = STEPS.findIndex(s => s.id === step);

  const goToStep = useCallback((next: WizardStep) => setStep(next), []);

  // Step 1 → 2
  const handleConnect = useCallback((fetchedListings: Listing[]) => {
    setListings(fetchedListings);
    goToStep("select");
  }, [goToStep]);

  // Step 2 → 3
  const handleSelect = useCallback(async (ids: string[]) => {
    setSelectedIds(ids);
    const selectedListings = listings.filter((l) => ids.includes(l.id));
    const cityBasedGroups = Array.from(new Set(selectedListings.map((l) => l.city).filter(Boolean))).slice(0, 3);
    setGroupDrafts(
      cityBasedGroups.map((city, idx) => ({
        name: `${city} Group`,
        listingIds: selectedListings.filter((l) => l.city === city).map((l) => l.id),
        color: ["#6366f1", "#8b5cf6", "#ec4899"][idx % 3],
      }))
    );
    await saveProgress({ step: "market", selectedListingIds: ids });
    goToStep("market");
  }, [goToStep, listings]);

  // Step 3 → 4
  const handleMarket = useCallback(async (code: string) => {
    setMarketCode(code);
    await saveProgress({ step: "strategy", marketCode: code });
    goToStep("strategy");
  }, [goToStep]);

  // Step 4 → 5: Activation - sends ALL listings (so all are seeded to DB) +
  // activatedListingIds (so backend knows which ones to mark active)
  const handleActivate = useCallback(async () => {
    // Trigger calendar sync (non-blocking)
    try {
      fetch("/api/sync/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingIds: selectedIds, scope: "calendar_90d" }),
      });
    } catch { /* non-fatal */ }

    // Save completion + seed ALL listings + strategy mode + get fresh JWT.
    // Sending all listings ensures every Hostaway property is stored in the DB.
    // The backend uses activatedListingIds to decide which ones get isActive=true.
    await saveProgress({
      step: "complete",
      activatedListingIds: selectedIds,
      listings,                // ← ALL fetched listings, not just selected
      strategy,
      pricingDefaults,
      ruleSetupMode,
      groupRuleDrafts,
      groupRuleDraftsByGroup,
      groupDrafts,
    });

    goToStep("complete");
  }, [listings, selectedIds, strategy, pricingDefaults, ruleSetupMode, groupRuleDrafts, groupRuleDraftsByGroup, groupDrafts, goToStep]);

  const handleBack = () => {
    const prevIndex = Math.max(0, currentIndex - 1);
    setStep(STEPS[prevIndex].id);
  };

  const handleGoToDashboard = useCallback(() => {
    // router.push respects the updated cookie from the PATCH response
    router.push("/dashboard");
    router.refresh();
  }, [router]);

  return (
    <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center p-6">
      <div className={cn("w-full", step === "strategy" ? "max-w-6xl" : "max-w-lg")}>
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="h-4 w-4 text-black" />
            </div>
            <span className="text-lg font-bold text-white">PriceOS</span>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            {step === "complete" ? "Welcome aboard" : "Let's get you set up"}
          </h1>
          <p className="text-zinc-500 text-sm mt-2">
            {step === "complete" ? "Your revenue engine is ready." : "Takes less than 3 minutes"}
          </p>
        </div>

        {/* Step Progress Bar */}
        {step !== "complete" && (
          <div className="flex items-center gap-1 mb-8">
            {STEPS.filter(s => s.id !== "complete").map((s, i) => {
              const isDone = i < currentIndex;
              const isActive = i === currentIndex;
              return (
                <div key={s.id} className="flex items-center flex-1">
                  <div className={cn(
                    "h-1 flex-1 rounded-full transition-all duration-500",
                    isDone ? "bg-primary" : isActive ? "bg-primary/40" : "bg-zinc-800"
                  )} />
                </div>
              );
            })}
          </div>
        )}

        {/* Step Label */}
        {step !== "complete" && (
          <div className="flex items-center gap-2 mb-6">
            <span className="text-xs font-bold text-primary uppercase tracking-wider">
              Step {currentIndex + 1} of {STEPS.length - 1}
            </span>
            <span className="text-xs text-zinc-600">·</span>
            <span className="text-xs text-zinc-500 capitalize">{step}</span>
          </div>
        )}

        {/* Card */}
        <div className={cn("bg-zinc-950 border border-zinc-800/80 rounded-2xl shadow-2xl", step === "strategy" ? "p-5" : "p-7")}>
          {step === "connect"  && <StepConnect onNext={handleConnect} />}
          {step === "select"   && <StepSelect listings={listings} onNext={handleSelect} />}
          {step === "market"   && <StepMarket initialMarket={marketCode} onNext={handleMarket} />}
          {step === "strategy" && (
            <StepStrategy
              listings={listings}
              selectedIds={selectedIds}
              marketCode={marketCode}
              strategy={strategy}
              pricingDefaults={pricingDefaults}
              onPricingDefaultsChange={(patch) => setPricingDefaults((prev) => ({ ...prev, ...patch }))}
              ruleSetupMode={ruleSetupMode}
              onRuleSetupModeChange={setRuleSetupMode}
              groupRuleDrafts={groupRuleDrafts}
              groupRuleDraftsByGroup={groupRuleDraftsByGroup}
              onGroupRuleDraftsByGroupChange={setGroupRuleDraftsByGroup}
              onGroupRuleDraftsChange={setGroupRuleDrafts}
              groupDrafts={groupDrafts}
              onGroupDraftsChange={setGroupDrafts}
              onStrategyChange={setStrategy}
              onActivate={handleActivate}
            />
          )}
          {step === "complete" && (
            <StepComplete onGoToDashboard={handleGoToDashboard} />
          )}
        </div>

        {/* Back button */}
        {step !== "connect" && step !== "complete" && (
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-400 mt-4 mx-auto transition-colors"
          >
            <ArrowLeft className="h-3 w-3" /> Back
          </button>
        )}
      </div>
    </div>
  );
}

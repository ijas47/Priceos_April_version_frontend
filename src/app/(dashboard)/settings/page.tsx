"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Building2,
  Link2,
  Eye,
  EyeOff,
  Globe2,
  Loader2,
  Save,
  Check,
  Sparkles,
} from "lucide-react";
import { SmartPricingCard } from "@/components/settings/smart-pricing-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

interface Market {
  code: string;
  name: string;
  country: string;
  currency: string;
  timezone: string;
  weekend: string;
  flag: string;
}

interface OrgSettings {
  id: string;
  name: string;
  fullName: string;
  email: string;
  role: string;
  plan: string;
  marketCode: string;
  currency: string;
  timezone: string;
  hostawayApiKey: string;
  hostawayAccountId: string;
  systemState: string;
  settings: {
    guardrails: {
      maxSingleDayChangePct: number;
      autoApproveThreshold: number;
      absoluteFloorMultiplier: number;
      absoluteCeilingMultiplier: number;
    };
    automation: {
      autoPushApproved: boolean;
      dailyPipelineRun: boolean;
    };
    overrides: {
      currency: string | null;
      timezone: string | null;
      weekendDefinition: string | null;
    };
  };
}

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  growth: "Growth",
  scale: "Scale",
};

const PLAN_LIMITS: Record<string, string> = {
  starter: "Up to 10 active property units.",
  growth: "Up to 50 active property units and 5 team seats.",
  scale: "Unlimited properties and team seats.",
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [org, setOrg] = useState<OrgSettings | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Editable form state
  const [apiKey, setApiKey] = useState("");
  const [accountId, setAccountId] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [selectedMarket, setSelectedMarket] = useState("");
  const [useCurrencyOverride, setUseCurrencyOverride] = useState(false);
  const [currencyOverride, setCurrencyOverride] = useState("");
  // Fetch org settings + markets in parallel
  useEffect(() => {
    Promise.all([
      fetch("/api/user/settings").then((r) => r.json()),
      fetch("/api/markets").then((r) => r.json()),
    ])
      .then(([orgData, marketsData]) => {
        setOrg(orgData);
        setMarkets(marketsData.markets ?? []);

        // Populate form state from DB
        setApiKey(orgData.hostawayApiKey || "");
        setAccountId(orgData.hostawayAccountId || "");
        setOrgName(orgData.name || "");
        setTimezone(orgData.timezone || "Asia/Dubai");
        setSelectedMarket(orgData.marketCode || "UAE_DXB");
        const hasCurrOverride = !!orgData.settings?.overrides?.currency;
        setUseCurrencyOverride(hasCurrOverride);
        setCurrencyOverride(orgData.settings?.overrides?.currency || "");
      })
      .catch((err) => {
        console.error("Failed to load settings:", err);
        toast.error("Failed to load settings");
      })
      .finally(() => setLoading(false));
  }, []);

  const activeMarket = markets.find((m) => m.code === selectedMarket);

  const handleSave = useCallback(
    async (patch: Record<string, unknown>) => {
      setSaving(true);
      setSaved(false);
      try {
        const res = await fetch("/api/user/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Save failed");
        }
        const savedData = await res.json();
        setOrg((prev) =>
          prev
            ? {
                ...prev,
                marketCode: (savedData.marketCode ?? prev.marketCode) as string,
                currency: (savedData.currency ?? prev.currency) as string,
                timezone: (savedData.timezone ?? prev.timezone) as string,
                settings: savedData.settings ?? prev.settings,
                name: (savedData.name ?? prev.name) as string,
              }
            : prev
        );
        setSaved(true);
        toast.success("Settings saved");
        setTimeout(() => setSaved(false), 2000);
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Save failed");
        return false;
      } finally {
        setSaving(false);
      }
    },
    []
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh] gap-2 text-text-disabled">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading settings…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 p-10 max-w-6xl mx-auto">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">Settings</h1>
        <p className="text-text-secondary text-body">
          Manage your organization, connections, and market configuration.
        </p>
      </div>

      <Tabs defaultValue="connections" className="w-full">
        <TabsList className="bg-surface-1 border border-border-subtle p-1 h-12">
          <TabsTrigger
            value="connections"
            className="data-[state=active]:bg-surface-2 data-[state=active]:text-amber text-body-xs font-medium px-6"
          >
            <Link2 className="h-3.5 w-3.5 mr-2" />
            Connections
          </TabsTrigger>
          <TabsTrigger
            value="pricing"
            className="data-[state=active]:bg-surface-2 data-[state=active]:text-amber text-body-xs font-medium px-6"
          >
            <Sparkles className="h-3.5 w-3.5 mr-2" />
            Pricing
          </TabsTrigger>
          <TabsTrigger
            value="organization"
            className="data-[state=active]:bg-surface-2 data-[state=active]:text-amber text-body-xs font-medium px-6"
          >
            <Building2 className="h-3.5 w-3.5 mr-2" />
            Organization
          </TabsTrigger>
        </TabsList>

        {/* ── TAB: Connections ──────────────────────────────────────────── */}
        <TabsContent
          value="connections"
          className="mt-8 space-y-8 animate-in fade-in-50 duration-500"
        >
          <div className="grid gap-6">
            {/* PMS Integration */}
            <div className="bg-surface-1 border border-border-subtle rounded-xl p-6 flex flex-col gap-6">
              <div className="flex flex-col gap-1">
                <h3 className="text-title font-semibold text-text-primary">PMS Integration</h3>
                <p className="text-body-xs text-text-tertiary">
                  Sync your property data and push pricing changes to Hostaway.
                </p>
              </div>

              <div className="flex flex-col gap-4 max-w-xl">
                <div className="space-y-2">
                  <Label htmlFor="hostaway-account-id" className="text-body-xs text-text-secondary">
                    Account ID
                  </Label>
                  <Input
                    id="hostaway-account-id"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="bg-surface-2 border-border-default h-10 text-body-xs"
                    placeholder="e.g. 12345"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hostaway-api" className="text-body-xs text-text-secondary">
                    Hostaway API Key
                  </Label>
                  <div className="relative">
                    <Input
                      id="hostaway-api"
                      type={showApiKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="bg-surface-2 border-border-default h-10 pr-10 font-mono text-body-xs"
                      placeholder="ha_live_..."
                    />
                    <button
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                    >
                      {showApiKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="rounded-lg border border-border-subtle bg-surface-2/30 p-3">
                  <p className="text-[10px] font-semibold text-text-primary mb-1">
                    Sync behavior
                  </p>
                  <p className="text-[11px] text-text-tertiary leading-relaxed">
                    These credentials are saved per organization in MongoDB and used when you click
                    {" "}
                    <span className="font-medium text-text-primary">Sync Hostaway</span>.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleSave({ hostawayApiKey: apiKey.trim(), hostawayAccountId: accountId.trim() })}
                    disabled={saving}
                    className="bg-amber hover:bg-amber/90 text-black font-bold h-10 px-6 rounded-md text-body-xs w-fit transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    <SaveIcon saving={saving} saved={saved} />
                    Save Credentials
                  </button>
                </div>
              </div>
            </div>

            {/* Market Configuration */}
            <div className="bg-surface-1 border border-border-subtle rounded-xl p-6 flex flex-col gap-6">
              <div className="flex flex-col gap-1">
                <h3 className="text-title font-semibold text-text-primary">
                  Market Configuration
                </h3>
                <p className="text-body-xs text-text-tertiary">
                  Select your primary operating market for AI intelligence templates.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-body-xs text-text-secondary">Primary Market</Label>
                    <Select value={selectedMarket} onValueChange={setSelectedMarket}>
                      <SelectTrigger className="bg-surface-2 border-border-default h-10">
                        <SelectValue placeholder="Select a market" />
                      </SelectTrigger>
                      <SelectContent className="bg-surface-2 border-border-default text-text-primary">
                        {markets.map((m) => (
                          <SelectItem key={m.code} value={m.code}>
                            <span className="flex items-center gap-2">
                              <span>{m.flag}</span>
                              <span>
                                {m.name}, {m.country}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedMarket === org?.marketCode && (
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-primary/dim text-amber border-amber/20 h-5"
                      >
                        Current market
                      </Badge>
                    )}
                    <div className="mt-2 rounded-md border border-border-subtle bg-surface-2/30 p-2.5">
                      <p className="text-[10px] font-semibold text-text-primary mb-1">
                        What market code means
                      </p>
                      <p className="text-[10px] text-text-tertiary leading-relaxed">
                        Event intelligence source changes with this code. Run Aria and Market Sync use the selected
                        market code to fetch local events. Example: <span className="font-medium text-text-primary">ESP_MAD</span> means Madrid
                        event feed, <span className="font-medium text-text-primary">UAE_DXB</span> means Dubai event feed.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4 border-t border-border-subtle pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <Label className="text-body-xs text-text-primary font-medium">
                          Currency Override
                        </Label>
                        <p className="text-[10px] text-text-tertiary">
                          Market default: {activeMarket?.currency || org?.currency || "AED"}
                        </p>
                      </div>
                      <Switch
                        checked={useCurrencyOverride}
                        onCheckedChange={setUseCurrencyOverride}
                      />
                    </div>

                    {useCurrencyOverride && (
                      <div className="space-y-2 animate-in slide-in-from-top-1 duration-200">
                        <Label className="text-body-xs text-text-secondary">Custom Currency</Label>
                        <Input
                          value={currencyOverride}
                          onChange={(e) => setCurrencyOverride(e.target.value.toUpperCase())}
                          placeholder="e.g. USD, EUR, AED"
                          className="bg-surface-2 border-border-default h-10 text-body-xs"
                          maxLength={3}
                        />
                      </div>
                    )}
                  </div>

                  <button
                    onClick={async () => {
                      const previousMarket = org?.marketCode;
                      const marketChanged = selectedMarket !== previousMarket;
                      const ok = await handleSave({
                        marketCode: selectedMarket,
                        settings: {
                          overrides: {
                            currency: useCurrencyOverride ? currencyOverride : null,
                          },
                        },
                      });
                      if (ok && marketChanged) {
                        toast.info("Primary market updated", {
                          description:
                            "Run Aria to refresh market events and pricing context for the new market.",
                          duration: 7000,
                        });
                      }
                    }}
                    disabled={saving}
                    className="bg-amber hover:bg-amber/90 text-black font-bold h-10 px-6 rounded-md text-body-xs w-fit transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    <SaveIcon saving={saving} saved={saved} />
                    Save Market
                  </button>
                </div>

                {/* Market Spec Card */}
                <div className="bg-surface-2/50 rounded-lg p-4 border border-border-subtle flex flex-col gap-3">
                  <h4 className="text-body-xs font-bold text-text-tertiary uppercase tracking-wider">
                    Market Intelligence Spec
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <SpecRow label="Currency" value={activeMarket?.currency || "—"} />
                    <SpecRow
                      label="Weekend"
                      value={(activeMarket?.weekend || "sat_sun").replace("_", " & ").toUpperCase()}
                    />
                    <SpecRow label="Timezone" value={activeMarket?.timezone || "—"} />
                    <SpecRow label="Market Code" value={selectedMarket} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── TAB: Pricing ──────────────────────────────────────────────── */}
        <TabsContent
          value="pricing"
          className="mt-8 space-y-8 animate-in fade-in-50 duration-500"
        >
          <SmartPricingCard />
        </TabsContent>

        {/* ── TAB: Organization ─────────────────────────────────────────── */}
        <TabsContent
          value="organization"
          className="mt-8 space-y-8 animate-in fade-in-50 duration-500"
        >
          <div className="grid gap-6">
            <div className="bg-surface-1 border border-border-subtle rounded-xl p-6 flex flex-col gap-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-body-xs text-text-secondary">Organization Name</Label>
                    <Input
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      className="bg-surface-2 border-border-default h-10 text-body-xs"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-body-xs text-text-secondary">Email</Label>
                    <Input
                      value={org?.email || ""}
                      disabled
                      className="bg-surface-2 border-border-default h-10 text-body-xs opacity-60"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-body-xs text-text-secondary">Timezone</Label>
                    <Select value={timezone} onValueChange={setTimezone}>
                      <SelectTrigger className="bg-surface-2 border-border-default h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-surface-2 border-border-default text-text-primary max-h-60">
                        {[
                          "Asia/Dubai",
                          "Asia/Kolkata",
                          "Asia/Tokyo",
                          "Asia/Singapore",
                          "Europe/London",
                          "Europe/Paris",
                          "Europe/Amsterdam",
                          "Europe/Lisbon",
                          "America/New_York",
                          "America/Chicago",
                          "America/Los_Angeles",
                          "America/Sao_Paulo",
                          "Australia/Sydney",
                          "Africa/Cape_Town",
                          "Pacific/Auckland",
                        ].map((tz) => (
                          <SelectItem key={tz} value={tz}>
                            {tz.replace(/_/g, " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <button
                    onClick={() => handleSave({ name: orgName, timezone })}
                    disabled={saving}
                    className="bg-amber hover:bg-amber/90 text-black font-bold h-10 px-6 rounded-md text-body-xs w-fit transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    <SaveIcon saving={saving} saved={saved} />
                    Save Organization
                  </button>
                </div>

                {/* Plan Card */}
                <div className="flex flex-col justify-center gap-2 p-6 rounded-xl bg-primary/dim border border-amber/10">
                  <span className="text-body-xs font-bold text-amber uppercase tracking-widest">
                    Active Plan
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-text-primary">
                      {PLAN_LABELS[org?.plan || "starter"] || "Starter"} Plan
                    </span>
                  </div>
                  <p className="text-[11px] text-text-secondary leading-relaxed">
                    {PLAN_LIMITS[org?.plan || "starter"]}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-surface-2 text-text-tertiary border-border-subtle"
                    >
                      Role: {org?.role || "owner"}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] border-none",
                        org?.systemState === "active"
                          ? "bg-green-500/10 text-green-400"
                          : "bg-primary/10 text-primary"
                      )}
                    >
                      System: {org?.systemState || "connected"}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

      </Tabs>
    </div>
  );
}

// ── Small Components ─────────────────────────────────────────────────────────

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-text-tertiary">{label}</span>
      <span className="text-body-xs font-medium text-text-primary">{value}</span>
    </div>
  );
}


function SaveIcon({ saving, saved }: { saving: boolean; saved: boolean }) {
  if (saving) return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
  if (saved) return <Check className="h-3.5 w-3.5" />;
  return <Save className="h-3.5 w-3.5" />;
}

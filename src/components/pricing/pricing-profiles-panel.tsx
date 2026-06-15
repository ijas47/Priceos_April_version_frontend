"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Layers,
  Sun,
  RefreshCw,
  Pencil,
  Save,
  CalendarRange,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { MarketPricingPack, PricingProfile, MinStayProfile } from "@/lib/pricing/types";
import { OccupancyMatrixEditor } from "./occupancy-matrix-editor";
import { MinStayProfileEditor } from "./minstay-profile-editor";
import { SeasonalCalendarView } from "./seasonal-calendar-view";

export function PricingProfilesPanel({ embedded = false }: { embedded?: boolean }) {
  const [pack, setPack] = useState<MarketPricingPack | null>(null);
  const [draft, setDraft] = useState<MarketPricingPack | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [isDefault, setIsDefault] = useState(true);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editPricingId, setEditPricingId] = useState<string | null>(null);
  const [editMinStayId, setEditMinStayId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pricing/profiles");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setPack(data.pack);
      setDraft(structuredClone(data.pack));
      setVersion(data.version);
      setIsDefault(data.isDefault);
    } catch {
      toast.error("Could not load portfolio pricing profiles.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const applyDefaults = async () => {
    setApplying(true);
    try {
      const res = await fetch("/api/pricing/profiles", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Apply failed");
      toast.success(
        `UAE defaults applied to ${data.listingsUpdated} properties (${data.rulesCreated} rules).`
      );
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Apply failed");
    } finally {
      setApplying(false);
    }
  };

  const savePack = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await fetch("/api/pricing/profiles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      toast.success("Portfolio profiles saved.");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const updatePricingProfile = (profile: PricingProfile) => {
    if (!draft) return;
    setDraft({
      ...draft,
      pricingProfiles: draft.pricingProfiles.map((p) =>
        p.id === profile.id ? profile : p
      ),
    });
  };

  const updateMinStayProfile = (profile: MinStayProfile) => {
    if (!draft) return;
    setDraft({
      ...draft,
      minStayProfiles: draft.minStayProfiles.map((p) =>
        p.id === profile.id ? profile : p
      ),
    });
  };

  const editingPricing = draft?.pricingProfiles.find((p) => p.id === editPricingId);
  const editingMinStay = draft?.minStayProfiles.find((p) => p.id === editMinStayId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading portfolio profiles…
      </div>
    );
  }

  if (!pack || !draft) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className={embedded ? "text-sm font-semibold flex items-center gap-2" : "text-lg font-semibold flex items-center gap-2"}>
            <Layers className={embedded ? "h-4 w-4" : "h-5 w-5"} />{" "}
            {embedded ? "Portfolio defaults" : "Portfolio Profiles"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            {embedded
              ? "High / Low / Shoulder pricing profiles, seasonal calendar, and minimum-stay packs for your portfolio."
              : "Edit pricing and min-stay profiles at portfolio level. Groups and units override these."}
          </p>
          <div className="flex gap-2 mt-2">
            {version && <Badge variant="secondary" className="text-[10px]">v{version}</Badge>}
            {isDefault && <Badge variant="outline" className="text-[10px]">Runtime fallback</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={applyDefaults} disabled={applying} className="gap-1.5">
            {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Reset to UAE defaults
          </Button>
          <Button size="sm" onClick={savePack} disabled={saving} className="gap-1.5 bg-amber text-black hover:bg-amber/90">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save portfolio
          </Button>
        </div>
      </div>

      <Tabs defaultValue="pricing">
        <TabsList className="mb-4">
          <TabsTrigger value="pricing" className="gap-1.5 text-xs">
            <Sun className="h-3.5 w-3.5" /> Pricing Profiles
          </TabsTrigger>
          <TabsTrigger value="minstay" className="gap-1.5 text-xs">
            <CalendarRange className="h-3.5 w-3.5" /> Minstay Profiles
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1.5 text-xs">
            Seasonal Calendar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pricing" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {draft.pricingProfiles.map((profile) => (
              <div
                key={profile.id}
                className="rounded-xl border border-border/70 bg-card p-4 space-y-3 dark:border-white/10"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">{profile.name}</h3>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 text-xs"
                    onClick={() => setEditPricingId(profile.id)}
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                </div>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>LM: {profile.lastMinute.maxDiscountPct}% / {profile.lastMinute.withinDays}d gradual</li>
                  <li>Occupancy: {profile.occupancyPreset.replace(/_/g, " ")}</li>
                  <li>{profile.occupancyMatrix.rows.length} occ tiers × {profile.occupancyMatrix.dayRanges.length} windows</li>
                </ul>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="minstay" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {draft.minStayProfiles.map((profile) => (
              <div
                key={profile.id}
                className="rounded-xl border border-border/70 bg-card p-4 space-y-3 dark:border-white/10"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">{profile.name}</h3>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 text-xs"
                    onClick={() => setEditMinStayId(profile.id)}
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                </div>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>Default: {profile.default.weekdayMinStay}wd / {profile.default.weekendMinStay}we nights</li>
                  <li>Far-out tiers: {profile.farOut?.length ?? 0}</li>
                  <li>Adjacent tiers: {profile.adjacentBeforeUnavailable?.length ?? 0}</li>
                </ul>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="calendar">
          <SeasonalCalendarView
            pack={draft}
            calendarId={draft.portfolioDefaults.defaultSeasonalCalendarId}
          />
        </TabsContent>
      </Tabs>

      {/* Pricing profile editor */}
      <Dialog open={!!editPricingId} onOpenChange={(o) => !o && setEditPricingId(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit pricing profile — {editingPricing?.name}</DialogTitle>
          </DialogHeader>
          {editingPricing && (
            <div className="space-y-5 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Name</Label>
                  <Input
                    value={editingPricing.name}
                    onChange={(e) =>
                      updatePricingProfile({ ...editingPricing, name: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Occupancy preset label</Label>
                  <Select
                    value={editingPricing.occupancyPreset}
                    onValueChange={(v) =>
                      updatePricingProfile({
                        ...editingPricing,
                        occupancyPreset: v as PricingProfile["occupancyPreset"],
                      })
                    }
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom">Custom</SelectItem>
                      <SelectItem value="aggressive">Aggressive</SelectItem>
                      <SelectItem value="super_aggressive">Super Aggressive</SelectItem>
                      <SelectItem value="recommended">Recommended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Last-minute (gradual)</Label>
                  <Switch
                    checked={editingPricing.lastMinute.enabled}
                    onCheckedChange={(v) =>
                      updatePricingProfile({
                        ...editingPricing,
                        lastMinute: { ...editingPricing.lastMinute, enabled: v },
                      })
                    }
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[10px]">Max discount %</Label>
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      value={editingPricing.lastMinute.maxDiscountPct}
                      onChange={(e) =>
                        updatePricingProfile({
                          ...editingPricing,
                          lastMinute: {
                            ...editingPricing.lastMinute,
                            maxDiscountPct: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-[10px]">Min discount %</Label>
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      value={editingPricing.lastMinute.minDiscountPct}
                      onChange={(e) =>
                        updatePricingProfile({
                          ...editingPricing,
                          lastMinute: {
                            ...editingPricing.lastMinute,
                            minDiscountPct: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-[10px]">Within days</Label>
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      value={editingPricing.lastMinute.withinDays}
                      onChange={(e) =>
                        updatePricingProfile({
                          ...editingPricing,
                          lastMinute: {
                            ...editingPricing.lastMinute,
                            withinDays: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <OccupancyMatrixEditor
                matrix={editingPricing.occupancyMatrix}
                onChange={(occupancyMatrix) =>
                  updatePricingProfile({ ...editingPricing, occupancyMatrix })
                }
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPricingId(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Minstay profile editor */}
      <Dialog open={!!editMinStayId} onOpenChange={(o) => !o && setEditMinStayId(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit minstay profile — {editingMinStay?.name}</DialogTitle>
          </DialogHeader>
          {editingMinStay && (
            <MinStayProfileEditor
              profile={editingMinStay}
              onChange={updateMinStayProfile}
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMinStayId(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
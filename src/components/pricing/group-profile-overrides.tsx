"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Save, Layers, Sun, CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { MarketPricingPack, MinStayProfile } from "@/lib/pricing/types";
import { MinStayProfileEditor } from "./minstay-profile-editor";

export interface GroupProfileFields {
  _id: string;
  pricingProfileOverrideId?: string;
  seasonalCalendarOverrideId?: string;
  minStayProfileOverrideId?: string;
}

interface Props {
  group: GroupProfileFields;
  onUpdated: (patch: GroupProfileFields) => void;
}

const INHERIT = "__inherit__";

export function GroupProfileOverrides({ group, onUpdated }: Props) {
  const [pack, setPack] = useState<MarketPricingPack | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [pricingProfileId, setPricingProfileId] = useState(
    group.pricingProfileOverrideId ?? INHERIT
  );
  const [seasonalCalendarId, setSeasonalCalendarId] = useState(
    group.seasonalCalendarOverrideId ?? INHERIT
  );
  const [minStayProfileId, setMinStayProfileId] = useState(
    group.minStayProfileOverrideId ?? INHERIT
  );

  useEffect(() => {
    setPricingProfileId(group.pricingProfileOverrideId ?? INHERIT);
    setSeasonalCalendarId(group.seasonalCalendarOverrideId ?? INHERIT);
    setMinStayProfileId(group.minStayProfileOverrideId ?? INHERIT);
  }, [group]);

  const loadPack = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pricing/profiles");
      if (!res.ok) throw new Error("Failed to load profiles");
      const data = await res.json();
      setPack(data.pack ?? null);
    } catch {
      toast.error("Could not load portfolio profiles.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPack();
  }, [loadPack]);

  const selectedMinStay: MinStayProfile | undefined = pack?.minStayProfiles.find(
    (p) => p.id === minStayProfileId
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = {
        pricingProfileOverrideId:
          pricingProfileId === INHERIT ? null : pricingProfileId,
        seasonalCalendarOverrideId:
          seasonalCalendarId === INHERIT ? null : seasonalCalendarId,
        minStayProfileOverrideId:
          minStayProfileId === INHERIT ? null : minStayProfileId,
      };
      const res = await fetch(`/api/groups/${group._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      onUpdated({
        ...group,
        pricingProfileOverrideId: data.pricingProfileOverrideId,
        seasonalCalendarOverrideId: data.seasonalCalendarOverrideId,
        minStayProfileOverrideId: data.minStayProfileOverrideId,
      });
      toast.success("Group profile overrides saved.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading portfolio profiles…
      </div>
    );
  }

  if (!pack) return null;

  return (
    <div className="rounded-2xl border border-border-default bg-surface-1 p-6 space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Layers className="w-4 h-4 text-text-tertiary" />
          <h2 className="text-sm font-semibold text-text-primary">Group profile overrides</h2>
        </div>
        <p className="text-xs text-text-tertiary ml-6">
          Overrides portfolio defaults for every property in this group. Unit-level settings still win.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-border-default p-4 bg-surface-0">
          <div className="flex items-center gap-2">
            <Sun className="h-3.5 w-3.5 text-amber" />
            <Label className="text-xs font-semibold">Pricing profile</Label>
          </div>
          <Select value={pricingProfileId} onValueChange={setPricingProfileId}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Inherit portfolio" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={INHERIT} className="text-xs">
                Inherit portfolio (seasonal calendar)
              </SelectItem>
              {pack.pricingProfiles.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-text-tertiary">
            Forces LM ramp + occupancy matrix from this profile for all group properties.
          </p>
        </div>

        <div className="space-y-2 rounded-xl border border-border-default p-4 bg-surface-0">
          <div className="flex items-center gap-2">
            <CalendarRange className="h-3.5 w-3.5 text-amber" />
            <Label className="text-xs font-semibold">Seasonal calendar</Label>
          </div>
          <Select value={seasonalCalendarId} onValueChange={setSeasonalCalendarId}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Inherit portfolio" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={INHERIT} className="text-xs">
                Inherit portfolio default
              </SelectItem>
              {pack.seasonalCalendars.map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-xs">
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-text-tertiary">
            Which date ranges map to High / Summer / Shoulder profiles.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border-default p-4 bg-surface-0 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <CalendarRange className="h-3.5 w-3.5 text-amber" />
              <Label className="text-xs font-semibold">Minstay profile (MLOS)</Label>
            </div>
            <p className="text-[10px] text-text-tertiary mt-1">
              Overrides seasonal MLOS for all properties in this group — far-out and adjacent tiers apply in the engine.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-text-tertiary">Inherit</span>
            <Switch
              checked={minStayProfileId === INHERIT}
              onCheckedChange={(inherit) =>
                setMinStayProfileId(
                  inherit ? INHERIT : pack.minStayProfiles[0]?.id ?? INHERIT
                )
              }
            />
          </div>
        </div>

        {minStayProfileId !== INHERIT && (
          <>
            <Select value={minStayProfileId} onValueChange={setMinStayProfileId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select MLOS profile" />
              </SelectTrigger>
              <SelectContent>
                {pack.minStayProfiles.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-xs">
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedMinStay && (
              <MinStayProfileEditor profile={selectedMinStay} onChange={() => {}} readOnly />
            )}
            <p className="text-[10px] text-text-tertiary">
              Edit tiers in Pricing → Profiles → Minstay Profiles (portfolio).
            </p>
          </>
        )}
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Save overrides
        </Button>
      </div>
    </div>
  );
}
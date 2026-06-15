"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import type { MinStayProfile, MinStayTier } from "@/lib/pricing/types";
import { cn } from "@/lib/utils";

interface Props {
  profile: MinStayProfile;
  onChange: (profile: MinStayProfile) => void;
  readOnly?: boolean;
  className?: string;
}

function TierTable({
  title,
  description,
  tiers,
  mode,
  onChange,
  readOnly,
}: {
  title: string;
  description: string;
  tiers: MinStayTier[];
  mode: "farOut" | "adjacent";
  onChange: (tiers: MinStayTier[]) => void;
  readOnly?: boolean;
}) {
  const addTier = () => {
    const base: MinStayTier =
      mode === "farOut"
        ? { beyondNights: 31, weekdayMinStay: 3, weekendMinStay: 3 }
        : {
            withinNightsBeforeUnavailable: 1,
            weekdayMinStay: 1,
            weekendMinStay: 1,
            appliedWithinStart: 0,
            appliedWithinEnd: 999,
          };
    onChange([...(tiers ?? []), base]);
  };

  const update = (idx: number, patch: Partial<MinStayTier>) => {
    onChange((tiers ?? []).map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  };

  const remove = (idx: number) => {
    onChange((tiers ?? []).filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-xs font-semibold">{title}</h4>
          <p className="text-[10px] text-muted-foreground">{description}</p>
        </div>
        {!readOnly && (
          <Button type="button" size="sm" variant="outline" className="h-7 text-[10px]" onClick={addTier}>
            <Plus className="h-3 w-3 mr-1" /> Add tier
          </Button>
        )}
      </div>
      {(tiers ?? []).length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic py-2">No tiers configured.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/70 dark:border-white/10">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/40 border-b border-border/50 text-muted-foreground">
                <th className="text-left p-2">
                  {mode === "farOut" ? "Beyond (nights)" : "Nights before block"}
                </th>
                <th className="p-2">Weekday min</th>
                <th className="p-2">Weekend min</th>
                {mode === "adjacent" && (
                  <>
                    <th className="p-2">Apply from</th>
                    <th className="p-2">Apply to</th>
                  </>
                )}
                {!readOnly && <th className="w-8" />}
              </tr>
            </thead>
            <tbody>
              {(tiers ?? []).map((tier, idx) => (
                <tr key={`tier-${idx}`} className="border-b border-border/30">
                  <td className="p-2">
                    {readOnly ? (
                      mode === "farOut" ? tier.beyondNights : tier.withinNightsBeforeUnavailable
                    ) : (
                      <Input
                        type="number"
                        className="h-7 w-20 text-xs"
                        value={
                          mode === "farOut"
                            ? tier.beyondNights ?? 0
                            : tier.withinNightsBeforeUnavailable ?? 0
                        }
                        onChange={(e) =>
                          update(
                            idx,
                            mode === "farOut"
                              ? { beyondNights: Number(e.target.value) }
                              : { withinNightsBeforeUnavailable: Number(e.target.value) }
                          )
                        }
                      />
                    )}
                  </td>
                  <td className="p-2 text-center">
                    {readOnly ? (
                      tier.weekdayMinStay
                    ) : (
                      <Input
                        type="number"
                        className="h-7 w-14 text-xs mx-auto"
                        value={tier.weekdayMinStay}
                        onChange={(e) => update(idx, { weekdayMinStay: Number(e.target.value) })}
                      />
                    )}
                  </td>
                  <td className="p-2 text-center">
                    {readOnly ? (
                      tier.weekendMinStay
                    ) : (
                      <Input
                        type="number"
                        className="h-7 w-14 text-xs mx-auto"
                        value={tier.weekendMinStay}
                        onChange={(e) => update(idx, { weekendMinStay: Number(e.target.value) })}
                      />
                    )}
                  </td>
                  {mode === "adjacent" && (
                    <>
                      <td className="p-2 text-center">
                        {readOnly ? (
                          tier.appliedWithinStart ?? 0
                        ) : (
                          <Input
                            type="number"
                            className="h-7 w-14 text-xs mx-auto"
                            value={tier.appliedWithinStart ?? 0}
                            onChange={(e) =>
                              update(idx, { appliedWithinStart: Number(e.target.value) })
                            }
                          />
                        )}
                      </td>
                      <td className="p-2 text-center">
                        {readOnly ? (
                          tier.appliedWithinEnd ?? 999
                        ) : (
                          <Input
                            type="number"
                            className="h-7 w-14 text-xs mx-auto"
                            value={tier.appliedWithinEnd ?? 999}
                            onChange={(e) =>
                              update(idx, { appliedWithinEnd: Number(e.target.value) })
                            }
                          />
                        )}
                      </td>
                    </>
                  )}
                  {!readOnly && (
                    <td className="p-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => remove(idx)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function MinStayProfileEditor({ profile, onChange, readOnly, className }: Props) {
  return (
    <div className={cn("space-y-5", className)}>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Profile name</Label>
          {readOnly ? (
            <p className="text-sm font-medium">{profile.name}</p>
          ) : (
            <Input
              value={profile.name}
              onChange={(e) => onChange({ ...profile, name: e.target.value })}
              className="h-8 text-sm"
            />
          )}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Profile ID</Label>
          <p className="text-xs text-muted-foreground font-mono pt-1.5">{profile.id}</p>
        </div>
      </div>

      <div className="rounded-lg border border-border/70 p-4 space-y-3 dark:border-white/10">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Default</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-[10px]">Weekday min nights</Label>
            {readOnly ? (
              <p className="text-sm">{profile.default.weekdayMinStay}</p>
            ) : (
              <Input
                type="number"
                className="h-8 text-sm"
                value={profile.default.weekdayMinStay}
                onChange={(e) =>
                  onChange({
                    ...profile,
                    default: { ...profile.default, weekdayMinStay: Number(e.target.value) },
                  })
                }
              />
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Weekend min nights</Label>
            {readOnly ? (
              <p className="text-sm">{profile.default.weekendMinStay}</p>
            ) : (
              <Input
                type="number"
                className="h-8 text-sm"
                value={profile.default.weekendMinStay}
                onChange={(e) =>
                  onChange({
                    ...profile,
                    default: { ...profile.default, weekendMinStay: Number(e.target.value) },
                  })
                }
              />
            )}
          </div>
        </div>
      </div>

      <TierTable
        title="Far out"
        description="Increase minimum stay for bookings far in the future."
        tiers={profile.farOut ?? []}
        mode="farOut"
        readOnly={readOnly}
        onChange={(farOut) => onChange({ ...profile, farOut })}
      />

      <TierTable
        title="Adjacent day before unavailable night"
        description="Lower min stay when a blocked/booked night follows within N days."
        tiers={profile.adjacentBeforeUnavailable ?? []}
        mode="adjacent"
        readOnly={readOnly}
        onChange={(adjacentBeforeUnavailable) =>
          onChange({ ...profile, adjacentBeforeUnavailable })
        }
      />
    </div>
  );
}
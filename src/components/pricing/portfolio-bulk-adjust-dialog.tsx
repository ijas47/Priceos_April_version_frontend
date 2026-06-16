"use client";

import { useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { Percent, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

interface ListingOption {
  id: string;
  name: string;
  currencyCode?: string;
}

interface PreviewResult {
  daysAffected: number;
  daysScanned: number;
  listingsMatched: number;
  clampedToFloor: number;
  clampedToCeiling: number;
  sample: Array<{
    listingName: string;
    date: string;
    currentPrice: number;
    newPrice: number;
  }>;
}

interface Props {
  listings: ListingOption[];
  onApplied?: () => void;
}

const PRESETS = [-15, -10, -5, 5, 10, 15];

export function PortfolioBulkAdjustDialog({ listings, onApplied }: Props) {
  const today = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const defaultEnd = useMemo(() => format(addDays(new Date(), 29), "yyyy-MM-dd"), []);

  const [open, setOpen] = useState(false);
  const [adjPct, setAdjPct] = useState("-10");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [scope, setScope] = useState<"all" | "selected">("all");
  const [selectedListingIds, setSelectedListingIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"proposals" | "calendar">("proposals");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  const pctNum = Number(adjPct);
  const pctValid = Number.isFinite(pctNum) && pctNum !== 0 && pctNum >= -50 && pctNum <= 50;

  const toggleListing = (id: string) => {
    setSelectedListingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPreview(null);
  };

  const payload = () => ({
    adjPct: pctNum,
    startDate,
    endDate,
    mode,
    onlyAvailable: true,
    listingIds:
      scope === "selected" ? Array.from(selectedListingIds) : undefined,
  });

  const runPreview = async () => {
    if (!pctValid) {
      toast.error("Enter a % between -50 and +50 (not 0).");
      return;
    }
    if (scope === "selected" && selectedListingIds.size === 0) {
      toast.error("Select at least one property.");
      return;
    }
    setIsPreviewing(true);
    try {
      const res = await fetch("/api/inventory/bulk-adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload(), dryRun: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Preview failed");
      setPreview(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setIsPreviewing(false);
    }
  };

  const applyAdjust = async () => {
    if (!pctValid) {
      toast.error("Enter a valid adjustment %.");
      return;
    }
    if (scope === "selected" && selectedListingIds.size === 0) {
      toast.error("Select at least one property.");
      return;
    }
    setIsApplying(true);
    try {
      const res = await fetch("/api/inventory/bulk-adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Apply failed");

      const sign = pctNum > 0 ? "+" : "";
      toast.success(
        `${sign}${pctNum}% applied to ${data.modifiedCount} day(s) across ${data.listingsMatched} propert${data.listingsMatched === 1 ? "y" : "ies"}.`
      );
      setOpen(false);
      setPreview(null);
      onApplied?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to apply adjustment");
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setPreview(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <Percent className="h-3.5 w-3.5" />
          Portfolio % Adjust
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Portfolio % adjust</DialogTitle>
          <DialogDescription>
            Shift available-night rates across properties — like a tactical PriceLabs bulk
            update. Respects each property&apos;s floor and ceiling.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label className="text-xs">Adjustment %</Label>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setAdjPct(String(p));
                    setPreview(null);
                  }}
                  className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                    Number(adjPct) === p
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  {p > 0 ? "+" : ""}
                  {p}%
                </button>
              ))}
            </div>
            <Input
              type="number"
              value={adjPct}
              onChange={(e) => {
                setAdjPct(e.target.value);
                setPreview(null);
              }}
              className="h-9"
              placeholder="e.g. -10"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPreview(null);
                }}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPreview(null);
                }}
                className="h-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Apply as</Label>
            <Select
              value={mode}
              onValueChange={(v) => {
                setMode(v as "proposals" | "calendar");
                setPreview(null);
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="proposals">
                  Pending proposals (review before approve)
                </SelectItem>
                <SelectItem value="calendar">
                  Calendar rates (updates listed prices directly)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Properties</Label>
            <Select
              value={scope}
              onValueChange={(v) => {
                setScope(v as "all" | "selected");
                setPreview(null);
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All active properties ({listings.length})</SelectItem>
                <SelectItem value="selected">Selected properties</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scope === "selected" && (
            <div className="max-h-36 overflow-y-auto rounded-md border border-border p-2 space-y-1.5">
              {listings.map((l) => (
                <label
                  key={l.id}
                  className="flex items-center gap-2 text-xs cursor-pointer"
                >
                  <Checkbox
                    checked={selectedListingIds.has(l.id)}
                    onCheckedChange={() => toggleListing(l.id)}
                  />
                  <span className="truncate">{l.name}</span>
                </label>
              ))}
            </div>
          )}

          {preview && (
            <div className="rounded-lg border border-border/70 bg-muted/30 p-3 text-xs space-y-1">
              <p>
                <strong>{preview.daysAffected}</strong> of {preview.daysScanned} available
                nights will change across {preview.listingsMatched} properties.
              </p>
              {(preview.clampedToFloor > 0 || preview.clampedToCeiling > 0) && (
                <p className="text-muted-foreground">
                  {preview.clampedToFloor > 0 && `${preview.clampedToFloor} clamped to floor. `}
                  {preview.clampedToCeiling > 0 && `${preview.clampedToCeiling} clamped to ceiling.`}
                </p>
              )}
              {preview.sample?.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-muted-foreground">
                  {preview.sample.slice(0, 4).map((s) => (
                    <li key={`${s.listingName}-${s.date}`}>
                      {s.listingName} · {s.date}: {s.currentPrice.toLocaleString("en-US")} →{" "}
                      {s.newPrice.toLocaleString("en-US")}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPreviewing || !pctValid}
            onClick={runPreview}
          >
            {isPreviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Preview"}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={isApplying || !pctValid}
            onClick={applyAdjust}
            className="bg-primary text-primary-foreground"
          >
            {isApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
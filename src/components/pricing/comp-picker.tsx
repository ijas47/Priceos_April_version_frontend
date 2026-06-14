"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Star, ExternalLink, RefreshCw } from "lucide-react";

interface Comp {
  listingId: string;
  name: string;
  ltmAdr: number | null;
  ltmOccupancy: number | null;
  bedrooms: number | null;
  rating: number | null;
  reviews: number | null;
  url: string | null;
  selected: boolean;
}

interface CompResponse {
  comps: Comp[];
  selected: string[];
  compAnchorAdr: number | null;
  currencyCode?: string;
  error?: string;
}

/**
 * Comp picker — pulls nearby competitor listings (Airbtics) for this property,
 * lets the host choose which ones to benchmark against, and saves the
 * selection. The median trailing ADR of the chosen comps anchors the engine's
 * base price (re-run pricing to apply). Read-only against Hostaway.
 */
export function CompPicker({ listingId }: { listingId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [comps, setComps] = useState<Comp[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<number | null>(null);
  const [currency, setCurrency] = useState("AED");
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/listings/${listingId}/comps`, { cache: "no-store" });
      const data: CompResponse = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load comps");
      setComps(data.comps || []);
      setSelected(new Set(data.selected || []));
      setAnchor(data.compAnchorAdr ?? null);
      if (data.currencyCode) setCurrency(data.currencyCode);
      if (data.error) setError(data.error);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSavedMsg(null);
  };

  const save = async () => {
    setSaving(true);
    setSavedMsg(null);
    try {
      const chosen = comps.filter((c) => selected.has(c.listingId));
      const res = await fetch(`/api/listings/${listingId}/comps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          compListingIds: chosen.map((c) => c.listingId),
          compAdrs: chosen.map((c) => c.ltmAdr).filter((n): n is number => !!n),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setAnchor(data.compAnchorAdr ?? null);
      setSavedMsg(data.message || "Saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Competitor set</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick the nearby listings you benchmark against. Their median ADR anchors your base price.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-md bg-muted/50 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            Selected: <span className="font-semibold text-foreground">{selected.size}</span>
          </span>
          {anchor != null && (
            <span className="text-muted-foreground">
              Anchor ADR:{" "}
              <span className="font-mono font-semibold text-foreground">
                {currency} {anchor.toLocaleString("en-US")}
              </span>
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading comparable listings…
          </div>
        ) : error && comps.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            {error}
          </div>
        ) : comps.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No comparable listings found nearby.
          </div>
        ) : (
          <div className="divide-y rounded-md border">
            {comps.map((c) => (
              <label
                key={c.listingId}
                className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted/40"
              >
                <Checkbox
                  checked={selected.has(c.listingId)}
                  onCheckedChange={() => toggle(c.listingId)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{c.name}</span>
                    {c.bedrooms != null && (
                      <Badge variant="secondary" className="shrink-0">
                        {c.bedrooms === 0 ? "Studio" : `${c.bedrooms} BR`}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {c.ltmAdr != null && (
                      <span className="font-mono">
                        ADR {currency} {c.ltmAdr.toLocaleString("en-US")}
                      </span>
                    )}
                    {c.ltmOccupancy != null && (
                      <span>Occ {Math.round(c.ltmOccupancy * 100)}%</span>
                    )}
                    {c.rating != null && (
                      <span className="flex items-center gap-0.5">
                        <Star className="h-3 w-3 fill-current" /> {c.rating.toFixed(1)}
                        {c.reviews != null && ` (${c.reviews})`}
                      </span>
                    )}
                  </div>
                </div>
                {c.url && (
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </label>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{savedMsg}</span>
          <Button onClick={save} disabled={saving || loading}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save comp set
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

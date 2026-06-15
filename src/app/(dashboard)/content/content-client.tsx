"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { RefreshCw, Sparkles, Check, X, Globe, FileText } from "lucide-react";
import { toast } from "sonner";

interface ListingRow {
  id: string;
  name: string;
  area?: string;
  hostawayId?: string;
}

interface ContentProposal {
  id: string;
  channel: string;
  field: string;
  currentValue: string;
  proposedValue: string;
  reasoning: string;
  visibilityDelta?: number;
  risk: string;
}

interface ContentSnapshot {
  visibilityScore: number;
  channelScores?: Record<string, number>;
  capturedAt: string;
  channels: {
    airbnb: { title?: string; summary?: string };
    booking_com: { title?: string; description?: string };
    vrbo: { headline?: string };
  };
}

const CHANNEL_LABELS: Record<string, string> = {
  airbnb: "Airbnb",
  booking_com: "Booking.com",
  vrbo: "VRBO",
};

const CHANNEL_STYLES: Record<string, string> = {
  airbnb: "bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-400",
  booking_com: "bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-400",
  vrbo: "bg-indigo-500/10 text-indigo-700 border-indigo-500/30 dark:text-indigo-400",
};

export function ContentManagerClient() {
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ContentSnapshot | null>(null);
  const [proposals, setProposals] = useState<ContentProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const loadListings = useCallback(async () => {
    const res = await fetch("/api/listings");
    if (!res.ok) return;
    const data = await res.json();
    const rows = (data.listings || []).map((l: ListingRow & { _id?: string }) => ({
      id: l.id || l._id || "",
      name: l.name,
      area: l.area,
      hostawayId: l.hostawayId,
    }));
    setListings(rows);
    if (!selectedId && rows.length > 0) setSelectedId(rows[0].id);
  }, [selectedId]);

  const loadContent = useCallback(async (listingId: string) => {
    const res = await fetch(`/api/listings/${listingId}/content`);
    if (!res.ok) {
      setSnapshot(null);
      setProposals([]);
      return;
    }
    const data = await res.json();
    setSnapshot(data.snapshot);
    setProposals(data.proposals || []);
  }, []);

  useEffect(() => {
    loadListings().finally(() => setLoading(false));
  }, [loadListings]);

  useEffect(() => {
    if (selectedId) loadContent(selectedId);
  }, [selectedId, loadContent]);

  const handleSync = async () => {
    if (!selectedId) return;
    setSyncing(true);
    try {
      const res = await fetch(`/api/listings/${selectedId}/content/sync`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      toast.success(`Synced from Hostaway — visibility score ${data.visibilityScore}`);
      await loadContent(selectedId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleOptimize = async () => {
    if (!selectedId) return;
    setOptimizing(true);
    try {
      const res = await fetch(`/api/listings/${selectedId}/content/optimize`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Optimize failed");
      toast.success(
        `${data.proposalCount} proposal(s) from ${data.source === "lyzr" ? "AI" : "rules"} engine`
      );
      await loadContent(selectedId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Optimize failed");
    } finally {
      setOptimizing(false);
    }
  };

  const handleApprove = async (proposalId: string) => {
    setActionId(proposalId);
    try {
      const res = await fetch(`/api/content-proposals/${proposalId}/approve`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || "Approve failed");
      toast.success(data.message || "Published to Hostaway");
      if (selectedId) await loadContent(selectedId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async (proposalId: string) => {
    setActionId(proposalId);
    try {
      const res = await fetch(`/api/content-proposals/${proposalId}/reject`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Reject failed");
      if (selectedId) await loadContent(selectedId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setActionId(null);
    }
  };

  const selected = listings.find((l) => l.id === selectedId);

  return (
    <div className="p-8 max-w-6xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-1">Content Manager</h1>
        <p className="text-muted-foreground text-sm">
          Per-OTA listing titles and descriptions — sync from Hostaway, optimize, approve, publish.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <select
          className="text-sm min-h-9 rounded-md border border-border bg-background px-3 py-1.5"
          value={selectedId ?? ""}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          {listings.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
              {l.area ? ` · ${l.area}` : ""}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={!selectedId || syncing || !selected?.hostawayId}
        >
          <RefreshCw className={cn("h-4 w-4 mr-1", syncing && "animate-spin")} />
          Sync from Hostaway
        </Button>
        <Button
          size="sm"
          onClick={handleOptimize}
          disabled={!selectedId || optimizing || !snapshot}
        >
          <Sparkles className="h-4 w-4 mr-1" />
          Optimize listing
        </Button>
        {!selected?.hostawayId && (
          <span className="text-xs text-muted-foreground">Link Hostaway to sync content</span>
        )}
      </div>

      {snapshot && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <ScoreCard label="Visibility" value={`${snapshot.visibilityScore}`} sub="Overall" />
          <ScoreCard
            label="Airbnb"
            value={`${snapshot.channelScores?.airbnb ?? "—"}`}
            sub={snapshot.channels.airbnb.title?.slice(0, 40) || "No title"}
          />
          <ScoreCard
            label="Booking.com"
            value={`${snapshot.channelScores?.booking_com ?? "—"}`}
            sub={snapshot.channels.booking_com.title?.slice(0, 40) || "No title"}
          />
          <ScoreCard
            label="VRBO"
            value={`${snapshot.channelScores?.vrbo ?? "—"}`}
            sub={snapshot.channels.vrbo.headline?.slice(0, 40) || "No headline"}
          />
        </div>
      )}

      {!snapshot && !loading && selectedId && (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground text-sm">
          <Globe className="h-8 w-8 mx-auto mb-2 opacity-50" />
          No content snapshot yet. Sync from Hostaway to start.
        </div>
      )}

      {proposals.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Pending proposals ({proposals.length})
          </h2>
          <div className="rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead>Field</TableHead>
                  <TableHead>Proposed</TableHead>
                  <TableHead>Δ score</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {proposals.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn("text-[10px]", CHANNEL_STYLES[p.channel])}
                      >
                        {CHANNEL_LABELS[p.channel] || p.channel}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs capitalize">{p.field}</TableCell>
                    <TableCell className="max-w-xs">
                      <p className="text-sm font-medium truncate">{p.proposedValue}</p>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                        {p.reasoning}
                      </p>
                    </TableCell>
                    <TableCell className="text-emerald-600 font-mono text-sm">
                      +{p.visibilityDelta ?? 0}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-green-600"
                          disabled={actionId === p.id}
                          onClick={() => handleApprove(p.id)}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-muted-foreground"
                          disabled={actionId === p.id}
                          onClick={() => handleReject(p.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Approve publishes to Hostaway (requires HOSTAWAY_READ_ONLY=false). Re-sync after publish
            to refresh scores.
          </p>
        </div>
      )}
    </div>
  );
}

function ScoreCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1 truncate">{sub}</p>
    </div>
  );
}
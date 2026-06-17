"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getOrgId } from "@/lib/auth/client";
import { cn } from "@/lib/utils";
import {
  Home,
  MapPin,
  BedDouble,
  Bath,
  Users,
  DollarSign,
  BarChart3,
  CalendarCheck2,
  Loader2,
  CheckCircle2,
  Plus,
  MinusCircle,
  ChevronRight,
  X,
  ShieldCheck,
  Clock,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { addDays, format, parseISO } from "date-fns";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartTooltip,
  Legend,
} from "recharts";

const CHART_GRID_STROKE = "hsl(var(--border))";
const CHART_AXIS_STROKE = "hsl(var(--muted-foreground))";
const CHART_TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--background))",
  borderColor: "hsl(var(--border))",
  borderRadius: "12px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
};
const ANALYTICS_COLORS = {
  blue: "#3b82f6",
  emerald: "#10b981",
  amber: "#2d7ff9",
  violet: "#8b5cf6",
  rose: "#f43f5e",
  cyan: "#06b6d4",
};
const CHANNEL_COLORS = ["#10b981", "#ef4444", "#3b82f6", "#8b5cf6", "#2d7ff9", "#14b8a6"];

// ── Types ────────────────────────────────────────────────────────────────────

interface ChannelRevenue {
  channel: string;
  revenue: number;
  count: number;
}

interface Property {
  id: string;
  name: string;
  city: string;
  area: string;
  bedrooms: number;
  bathrooms: number;
  basePrice: number;
  currency: string;
  priceFloor: number;
  priceCeiling: number;
  capacity: number | null;
  hostawayId: string | null;
  propertyType: string;
  isActive: boolean;
  isActivated: boolean;
  occupancyPct: number;
  avgPrice: number;
  pendingProposals: number;
  totalReservations: number;
  totalRevenue: number;
  revenueByChannel: ChannelRevenue[];
  createdAt: string;
}

type TabId = "selected" | "inactive";
type DetailTabId = "overview";

interface PropertyAnalyticsResponse {
  listingId: string;
  propertyName: string;
  dateRange: { from: string; to: string };
  summary: {
    totalBookings: number;
    totalRevenue: number;
    avgLos: number;
    occupancyPct: number;
    avgDailyRevenue: number;
  };
  bookingVelocity: { date: string; bookings: number; movingAvg7d: number }[];
  losDistribution: { bucket: string; bookings: number }[];
  occupancyTrend: { date: string; totalDays: number; bookedDays: number; blockedDays: number; occupancyPct: number }[];
  adrRevparTrend: { date: string; adr: number; revpar: number; bookedRevenue: number }[];
  channelMix: { channel: string; revenue: number; bookings: number; revenuePct: number }[];
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function PropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("selected");
  const [detailProperty, setDetailProperty] = useState<Property | null>(null);
  const [activating, setActivating] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState<string | null>(null);
  useEffect(() => {
    const orgId = getOrgId();
    if (!orgId) { setLoading(false); return; }
    fetch(`/api/properties?orgId=${orgId}`)
      .then((r) => r.json())
      .then((data) => setProperties(data.properties || []))
      .catch(() => toast.error("Failed to load properties"))
      .finally(() => setLoading(false));
  }, []);

  const selectedProperties = useMemo(
    () => properties.filter((p) => p.isActivated),
    [properties]
  );

  const inactiveProperties = useMemo(
    () => properties.filter((p) => !p.isActivated),
    [properties]
  );

  const displayList = activeTab === "selected" ? selectedProperties : inactiveProperties;

  const handleActivate = async (id: string) => {
    setActivating(id);
    try {
      const res = await fetch("/api/properties/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: id }),
      });
      if (!res.ok) throw new Error();
      setProperties((prev) =>
        prev.map((p) => (p.id === id ? { ...p, isActivated: true, isActive: true } : p))
      );
      toast.success("Property activated");
    } catch {
      toast.error("Failed to activate property");
    } finally {
      setActivating(null);
    }
  };

  const handleDeactivate = async (id: string) => {
    setDeactivating(id);
    try {
      const res = await fetch("/api/properties/deactivate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: id }),
      });
      if (!res.ok) throw new Error();
      setProperties((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                isActivated: false,
                isActive: false,
                occupancyPct: 0,
                avgPrice: 0,
                pendingProposals: 0,
                totalReservations: 0,
                totalRevenue: 0,
                revenueByChannel: [],
              }
            : p
        )
      );
      if (detailProperty?.id === id) {
        setDetailProperty(null);
      }
      toast.success("Property deactivated and removed from dashboards");
    } catch {
      toast.error("Failed to deactivate property");
    } finally {
      setDeactivating(null);
    }
  };

  const selectedCount = selectedProperties.length;
  const totalCount = properties.length;
  const allPropertiesCount = inactiveProperties.length;

  if (loading) {
    return (
      <div className="flex flex-col gap-6 p-8 max-w-7xl mx-auto">
        {/* Header Skeleton */}
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-5 w-96 max-w-full" />
        </div>

        {/* Tabs Skeleton */}
        <div className="flex items-center gap-1 border-b border-border-default pb-0">
          <div className="flex items-center gap-2 px-4 py-2.5">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-6 rounded-full" />
          </div>
          <div className="flex items-center gap-2 px-4 py-2.5">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-6 rounded-full" />
          </div>
        </div>

        {/* Grid Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-surface-1 border border-border-default rounded-xl p-5 flex flex-col gap-4">
              {/* Header */}
              <div className="flex justify-between items-start gap-2">
                <div className="flex flex-col gap-2 w-full">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="h-5 w-14 shrink-0" />
              </div>
              
              {/* Stats Row */}
              <div className="flex items-center gap-3">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-4 w-16 ml-auto" />
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border-subtle">
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-4 w-10" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-4 w-10" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-4 w-10" />
                </div>
              </div>
              
              <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-20" />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center justify-between w-full">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-7 w-24" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">Properties</h1>
        <p className="text-text-secondary text-sm">
          {selectedCount} of {totalCount} properties activated. Select properties to enable AI
          pricing.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border-default">
        {([
          { id: "selected" as TabId, label: "Selected", count: selectedCount },
          { id: "inactive" as TabId, label: "Inactive", count: allPropertiesCount },
        ]).map(({ id, label, count }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === id
                ? "border-amber text-amber"
                : "border-transparent text-text-secondary hover:text-text-primary hover:border-border-default"
            )}
          >
            {label}
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                activeTab === id ? "bg-amber/10 text-amber" : "bg-white/5 text-text-disabled"
              )}
            >
              {count}
            </span>
          </button>
        ))}
      </div>

      {displayList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 rounded-xl border border-white/5 bg-white/[0.02]">
          <Home className="h-8 w-8 text-text-disabled" />
          <p className="text-text-tertiary text-sm">
            {activeTab === "selected"
              ? "No properties activated yet. Go to \"Inactive\" to activate some."
              : "All properties are already activated."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayList.map((prop) => (
            <PropertyCard
              key={prop.id}
              property={prop}
              onActivate={handleActivate}
              onDeactivate={handleDeactivate}
              activating={activating === prop.id}
              deactivating={deactivating === prop.id}
              onOpenDetail={() => setDetailProperty(prop)}
            />
          ))}
        </div>
      )}

      {/* Detail Drawer */}
      {detailProperty && (
        <PropertyDetailDrawer
          property={detailProperty}
          onClose={() => setDetailProperty(null)}
        />
      )}
    </div>
  );
}

// ── Property Card ────────────────────────────────────────────────────────────

function PropertyCard({
  property: p,
  onActivate,
  onDeactivate,
  activating,
  deactivating,
  onOpenDetail,
}: {
  property: Property;
  onActivate: (id: string) => void;
  onDeactivate: (id: string) => void;
  activating: boolean;
  deactivating: boolean;
  onOpenDetail: () => void;
}) {
  return (
    <div
      className={cn(
        "bg-surface-1 border rounded-xl p-5 flex flex-col gap-4 group transition-all cursor-pointer",
        p.isActivated
          ? "border-border-default hover:border-amber/30"
          : "border-dashed border-border-subtle hover:border-amber/50"
      )}
      onClick={onOpenDetail}
    >
      {/* Header */}
      <div className="flex justify-between items-start gap-2">
        <div className="flex flex-col gap-1 min-w-0">
          <h3 className="text-sm font-semibold text-text-primary leading-snug group-hover:text-amber transition-colors line-clamp-2">
            {p.name}
          </h3>
          <div className="flex items-center gap-1.5 text-text-tertiary">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="text-[10px] truncate">{p.area || p.city || "-"}</span>
          </div>
        </div>
        {p.isActivated ? (
          <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-[9px] border shrink-0">
            Active
          </Badge>
        ) : (
          <Badge className="bg-white/5 text-text-disabled text-[9px] border border-white/10 shrink-0">
            Inactive
          </Badge>
        )}
      </div>

      {/* Stats Row */}
      <div className="flex items-center gap-3 text-[11px]">
        <span className="flex items-center gap-1 text-text-secondary">
          <BedDouble className="h-3 w-3" /> {p.bedrooms} BR
        </span>
        <span className="flex items-center gap-1 text-text-secondary">
          <Bath className="h-3 w-3" /> {p.bathrooms}
        </span>
        {p.capacity && (
          <span className="flex items-center gap-1 text-text-secondary">
            <Users className="h-3 w-3" /> {p.capacity}
          </span>
        )}
        <span className="flex items-center gap-1 text-text-primary font-bold ml-auto">
          <DollarSign className="h-3 w-3" /> {p.currency} {p.basePrice.toLocaleString("en-US")}
        </span>
      </div>

      {/* Metrics (only for activated) */}
      {p.isActivated && (
        <>
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border-subtle">
            <MiniStat label="Occupancy" value={`${p.occupancyPct}%`} icon={BarChart3} />
            <MiniStat label="Avg Price" value={`${p.avgPrice}`} icon={TrendingUp} />
            <MiniStat
              label="Pending"
              value={String(p.pendingProposals)}
              icon={Clock}
              highlight={p.pendingProposals > 0}
            />
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
            <span className="text-[9px] text-text-disabled uppercase tracking-wider flex items-center gap-1">
              <DollarSign className="h-2.5 w-2.5" /> Revenue
            </span>
            <span className="text-sm font-bold text-amber tabular-nums">
              {p.currency} {p.totalRevenue.toLocaleString("en-US")}
            </span>
          </div>
        </>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-1">
        {p.isActivated ? (
          <div className="flex items-center gap-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetail();
              }}
              className="text-[11px] text-text-secondary hover:text-amber flex items-center gap-1 transition-colors"
            >
              View Details <ChevronRight className="h-3 w-3" />
            </button>
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                const confirmed = window.confirm(
                  "Deactivate this property?\n\nThis will remove its data from analytics, chat, market events, pricing rules, and related dashboards."
                );
                if (!confirmed) return;
                onDeactivate(p.id);
              }}
              disabled={deactivating}
              className="h-7 px-3 text-[10px] border-rose-500/40 text-rose-500 hover:bg-rose-500/10 hover:text-rose-400"
            >
              {deactivating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <MinusCircle className="h-3 w-3" />
              )}
              <span className="ml-1">Deactivate</span>
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onActivate(p.id);
            }}
            disabled={activating}
            className="h-8 px-4 text-xs bg-amber text-black hover:bg-amber/90 gap-1.5"
          >
            {activating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
            Activate
          </Button>
        )}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: string;
  icon: any;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] text-text-disabled uppercase tracking-wider flex items-center gap-1">
        <Icon className="h-2.5 w-2.5" /> {label}
      </span>
      <span
        className={cn(
          "text-xs font-bold tabular-nums",
          highlight ? "text-amber" : "text-text-primary"
        )}
      >
        {value}
      </span>
    </div>
  );
}

// ── Detail Drawer ────────────────────────────────────────────────────────────

function PropertyDetailDrawer({
  property: p,
  onClose,
}: {
  property: Property;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pendingProposals, setPendingProposals] = useState<Array<{ id: string; currentPrice: number; proposedPrice: number; reasoning: string; changePct: number; date: string }>>([]);
  const [proposalsLoading, setProposalsLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setProposalsLoading(true);
      try {
        const orgId = await getOrgId();
        const res = await fetch(`/api/v1/revenue/proposals?orgId=${orgId}&listingId=${p.id}&status=pending`);
        if (res.ok) {
          const data = await res.json();
          setPendingProposals(data.proposals ?? data ?? []);
        }
      } catch {
        // silently fail - card count is still shown
      } finally {
        setProposalsLoading(false);
      }
    };
    load();
  }, [p.id]);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-surface-0 border-l border-border-default z-50 overflow-y-auto animate-in slide-in-from-right duration-300">
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-bold text-text-primary">{p.name}</h2>
              <div className="flex items-center gap-2 text-text-tertiary text-xs">
                <MapPin className="h-3.5 w-3.5" />
                {p.area || p.city || "Unknown location"}
              </div>
            </div>
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-md bg-surface-2 flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2">
            {p.isActivated ? (
              <Badge className="bg-green-500/10 text-green-400 border-green-500/20 border">
                Active
              </Badge>
            ) : (
              <Badge className="bg-white/5 text-text-disabled border border-white/10">
                Inactive
              </Badge>
            )}
            {p.hostawayId && (
              <Badge variant="outline" className="text-[10px] text-text-tertiary border-border-subtle">
                Hostaway #{p.hostawayId}
              </Badge>
            )}
          </div>

          <>
              {/* Property Details */}
              <div className="rounded-xl border border-border-subtle bg-surface-1 p-4">
                <h3 className="text-xs font-bold text-text-tertiary uppercase tracking-wider mb-3">
                  Property Details
                </h3>
                <div className="grid grid-cols-2 gap-y-3 gap-x-6">
                  <DetailRow label="Bedrooms" value={`${p.bedrooms}`} icon={BedDouble} />
                  <DetailRow label="Bathrooms" value={`${p.bathrooms}`} icon={Bath} />
                  {p.capacity && <DetailRow label="Capacity" value={`${p.capacity} guests`} icon={Users} />}
                  <DetailRow label="Base Price" value={`${p.currency} ${p.basePrice.toLocaleString("en-US")}`} icon={DollarSign} />
                  <DetailRow label="City" value={p.city || "-"} icon={MapPin} />
                  <DetailRow label="Area" value={p.area || "-"} icon={MapPin} />
                </div>
              </div>

              <div className="rounded-xl border border-border-subtle bg-surface-1 p-4">
                <h3 className="text-xs font-bold text-text-tertiary uppercase tracking-wider mb-3">
                  Pricing Configuration
                </h3>
                <div className="grid grid-cols-2 gap-y-3 gap-x-6">
                  <DetailRow label="Price Floor" value={p.priceFloor > 0 ? `${p.currency} ${p.priceFloor.toLocaleString("en-US")}` : "Not set"} icon={ShieldCheck} />
                  <DetailRow label="Price Ceiling" value={p.priceCeiling > 0 ? `${p.currency} ${p.priceCeiling.toLocaleString("en-US")}` : "Not set"} icon={ShieldCheck} />
                  <DetailRow label="Avg Price (30d)" value={`${p.currency} ${p.avgPrice.toLocaleString("en-US")}`} icon={TrendingUp} />
                </div>
              </div>

              {/* Pending Proposals */}
              <div className="rounded-xl border border-border-subtle bg-surface-1 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-text-tertiary uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />
                    Pending Proposals
                    {pendingProposals.length > 0 && (
                      <span className="ml-1 bg-amber/20 text-amber text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                        {pendingProposals.length}
                      </span>
                    )}
                  </h3>
                </div>
                {proposalsLoading ? (
                  <div className="flex items-center gap-2 text-text-tertiary text-xs py-2">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                  </div>
                ) : pendingProposals.length === 0 ? (
                  <p className="text-xs text-text-tertiary py-1">No pending proposals</p>
                ) : (
                  <div className="space-y-1.5">
                    {pendingProposals.map((proposal) => (
                      <button
                        key={proposal.id}
                        onClick={() => {
                          router.push(`/pricing?listingId=${p.id}`);
                          onClose();
                        }}
                        className="w-full text-left rounded-lg bg-surface-2/60 hover:bg-amber/10 border border-border-subtle hover:border-amber/30 px-3 py-2.5 transition-all group"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <TrendingUp className="h-3 w-3 text-amber shrink-0" />
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs text-text-secondary truncate">
                                {p.currency} {(proposal.currentPrice ?? 0).toLocaleString("en-US")} → {(proposal.proposedPrice ?? 0).toLocaleString("en-US")}
                              </span>
                              {proposal.date && (
                                <span className="text-[9px] text-text-tertiary">{proposal.date}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={cn(
                              "text-[9px] font-bold px-1.5 py-0.5 rounded-full border tabular-nums",
                              (proposal.changePct ?? 0) > 0
                                ? "bg-green-500/10 text-green-400 border-green-500/20"
                                : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                            )}>
                              {(proposal.changePct ?? 0) > 0 ? "+" : ""}{(proposal.changePct ?? 0).toFixed(1)}%
                            </span>
                            <ChevronRight className="h-3 w-3 text-text-disabled group-hover:text-amber transition-colors" />
                          </div>
                        </div>
                        {proposal.reasoning && (
                          <p className="text-[10px] text-text-tertiary mt-1 line-clamp-1">{proposal.reasoning}</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-border-subtle bg-surface-1 p-4">
                <h3 className="text-xs font-bold text-text-tertiary uppercase tracking-wider mb-3">
                  Performance (30-day)
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg bg-surface-2/50 p-3 text-center">
                    <p className="text-2xl font-bold text-text-primary tabular-nums">{p.occupancyPct}%</p>
                    <p className="text-[10px] text-text-tertiary">Occupancy</p>
                  </div>
                  <div className="rounded-lg bg-surface-2/50 p-3 text-center">
                    <p className="text-2xl font-bold text-text-primary tabular-nums">{p.totalReservations}</p>
                    <p className="text-[10px] text-text-tertiary">Total Reservations</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-amber/20 bg-amber/[0.03] p-4">
                <h3 className="text-xs font-bold text-amber uppercase tracking-wider mb-3">
                  Revenue
                </h3>
                <div className="rounded-lg bg-surface-2/50 p-4 text-center mb-4">
                  <p className="text-3xl font-bold text-amber tabular-nums">
                    {p.currency} {p.totalRevenue.toLocaleString("en-US")}
                  </p>
                  <p className="text-[10px] text-text-tertiary mt-1">Total Revenue</p>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <Home className="h-3 w-3 text-text-tertiary" />
                  <span className="text-[10px] text-text-disabled uppercase tracking-wider font-bold">
                    Property Type
                  </span>
                </div>
                <div className="rounded-lg bg-surface-2/30 px-3 py-2 mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-secondary">{p.propertyType}</span>
                    <span className="text-xs font-bold text-text-primary tabular-nums">
                      {p.currency} {p.totalRevenue.toLocaleString("en-US")}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="h-3 w-3 text-text-tertiary" />
                  <span className="text-[10px] text-text-disabled uppercase tracking-wider font-bold">
                    Revenue By Channel
                  </span>
                </div>
                {p.revenueByChannel.length > 0 ? (
                  <div className="space-y-1.5">
                    {p.revenueByChannel.map((ch) => {
                      const pct = p.totalRevenue > 0 ? Math.round((ch.revenue / p.totalRevenue) * 100) : 0;
                      return (
                        <div key={ch.channel} className="rounded-lg bg-surface-2/30 px-3 py-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-text-secondary">{ch.channel}</span>
                            <span className="text-xs font-bold text-text-primary tabular-nums">
                              {p.currency} {ch.revenue.toLocaleString("en-US")}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                              <div className="h-full bg-amber rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-[10px] text-text-disabled tabular-nums w-8 text-right">{pct}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-text-disabled text-center py-2">No booking data yet</p>
                )}
              </div>

              <div className="rounded-xl border border-border-subtle bg-surface-1 p-4">
                <h3 className="text-xs font-bold text-text-tertiary uppercase tracking-wider mb-3">
                  History
                </h3>
                <div className="space-y-2 text-xs text-text-secondary">
                  <div className="flex items-center gap-2">
                    <CalendarCheck2 className="h-3.5 w-3.5 text-text-tertiary" />
                    <span>
                      Added on{" "}
                      <strong className="text-text-primary">
                        {p.createdAt ? format(parseISO(p.createdAt), "d MMM yyyy") : "Unknown"}
                      </strong>
                    </span>
                  </div>
                  {p.isActivated && (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                      <span>Activated - AI pricing engine running</span>
                    </div>
                  )}
                </div>
              </div>
          </>
        </div>
      </div>
    </>
  );
}

function PropertyAnalyticsPanel({
  property,
  loading,
  error,
  data,
  range,
  rangePreset,
  onRangePresetChange,
  onRangeChange,
}: {
  property: Property;
  loading: boolean;
  error: string | null;
  data: PropertyAnalyticsResponse | null;
  range: { from: string; to: string };
  rangePreset: "30d" | "60d" | "90d" | "custom";
  onRangePresetChange: (v: "30d" | "60d" | "90d" | "custom") => void;
  onRangeChange: (v: { from: string; to: string }) => void;
}) {
  const shortDate = (d: string) => format(parseISO(`${d}T00:00:00.000Z`), "MMM d");
  const channelMixWithFill =
    data?.channelMix.map((item, index) => ({
      ...item,
      fill: CHANNEL_COLORS[index % CHANNEL_COLORS.length],
    })) ?? [];
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border-subtle bg-surface-1 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-bold text-text-tertiary uppercase tracking-wider">Analytics Window</h3>
          <div className="flex items-center gap-1.5">
            {(["30d", "60d", "90d"] as const).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => onRangePresetChange(preset)}
                className={cn(
                  "text-[10px] px-2 py-1 rounded-md border transition-colors",
                  rangePreset === preset
                    ? "bg-amber text-black border-amber"
                    : "border-border-subtle text-text-secondary hover:text-text-primary"
                )}
              >
                {preset}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onRangePresetChange("custom")}
              className={cn(
                "text-[10px] px-2 py-1 rounded-md border transition-colors",
                rangePreset === "custom"
                  ? "bg-amber text-black border-amber"
                  : "border-border-subtle text-text-secondary hover:text-text-primary"
              )}
            >
              Custom
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            value={range.from}
            onChange={(e) => {
              onRangePresetChange("custom");
              onRangeChange({ ...range, from: e.target.value });
            }}
            className="h-9 text-xs rounded-md border border-border-subtle bg-surface-2 px-2 text-text-primary"
          />
          <input
            type="date"
            value={range.to}
            onChange={(e) => {
              onRangePresetChange("custom");
              onRangeChange({ ...range, to: e.target.value });
            }}
            className="h-9 text-xs rounded-md border border-border-subtle bg-surface-2 px-2 text-text-primary"
          />
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-border-subtle bg-surface-1 p-6 flex items-center justify-center gap-2 text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading analytics...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-xs text-red-400">{error}</div>
      ) : !data ? (
        <div className="rounded-xl border border-border-subtle bg-surface-1 p-4 text-xs text-text-secondary">
          No analytics available yet for {property.name}.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <KpiCard label="Bookings" value={data.summary.totalBookings.toLocaleString("en-US")} accent="blue" />
            <KpiCard label="Avg LOS" value={`${data.summary.avgLos} nights`} accent="violet" />
            <KpiCard label="Occupancy" value={`${data.summary.occupancyPct}%`} accent="emerald" />
            <KpiCard label="Revenue" value={`${property.currency} ${data.summary.totalRevenue.toLocaleString("en-US")}`} accent="amber" />
          </div>

          <ChartCard title="Booking Velocity" subtitle="Bookings created per day + 7d moving average">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.bookingVelocity}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} strokeOpacity={0.25} />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10, fill: CHART_AXIS_STROKE }} />
                <YAxis tick={{ fontSize: 10, fill: CHART_AXIS_STROKE }} />
                <RechartTooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  labelFormatter={(v) => format(parseISO(`${String(v)}T00:00:00.000Z`), "dd MMM yyyy")}
                />
                <Legend />
                <Bar dataKey="bookings" name="Bookings" fill={ANALYTICS_COLORS.blue} radius={[6, 6, 0, 0]} />
                <Line type="monotone" dataKey="movingAvg7d" name="7d Avg" stroke={ANALYTICS_COLORS.amber} strokeWidth={3} dot={false} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Length of Stay Distribution" subtitle="Booking count by stay length">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.losDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} strokeOpacity={0.25} />
                <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: CHART_AXIS_STROKE }} />
                <YAxis tick={{ fontSize: 10, fill: CHART_AXIS_STROKE }} />
                <RechartTooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar dataKey="bookings" name="Bookings" radius={[6, 6, 0, 0]}>
                  {data.losDistribution.map((entry, index) => (
                    <Cell key={`${entry.bucket}-${index}`} fill={CHANNEL_COLORS[index % CHANNEL_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Occupancy Trend" subtitle="Daily occupancy for selected range">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data.occupancyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} strokeOpacity={0.25} />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10, fill: CHART_AXIS_STROKE }} />
                <YAxis tick={{ fontSize: 10, fill: CHART_AXIS_STROKE }} domain={[0, 100]} />
                <RechartTooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(val: number) => [`${val}%`, "Occupancy"]} />
                <defs>
                  <linearGradient id="occupancyFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={ANALYTICS_COLORS.emerald} stopOpacity={0.45} />
                    <stop offset="95%" stopColor={ANALYTICS_COLORS.emerald} stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="occupancyPct" name="Occupancy %" stroke={ANALYTICS_COLORS.emerald} fill="url(#occupancyFill)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="ADR vs RevPAR" subtitle="Daily pricing efficiency metrics">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.adrRevparTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} strokeOpacity={0.25} />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10, fill: CHART_AXIS_STROKE }} />
                <YAxis tick={{ fontSize: 10, fill: CHART_AXIS_STROKE }} />
                <RechartTooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Legend />
                <Line type="monotone" dataKey="adr" name="ADR" stroke={ANALYTICS_COLORS.violet} strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="revpar" name="RevPAR" stroke={ANALYTICS_COLORS.rose} strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Revenue by Channel" subtitle="Booking and revenue contribution by channel">
            <div className="space-y-4">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <RechartTooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(value: number, _name: string, item: any) => {
                      const metric = item?.dataKey === "revenue" ? "Revenue" : "Bookings";
                      return metric === "Revenue"
                        ? [`${property.currency} ${value.toLocaleString("en-US")}`, metric]
                        : [value, metric];
                    }}
                    labelFormatter={(_label: string, payload: any[]) => payload?.[0]?.payload?.channel || ""}
                  />
                  <Pie
                    data={channelMixWithFill}
                    dataKey="revenue"
                    nameKey="channel"
                    cx="32%"
                    cy="52%"
                    innerRadius={38}
                    outerRadius={70}
                    paddingAngle={4}
                    stroke="none"
                  >
                    {channelMixWithFill.map((entry, index) => (
                      <Cell key={`${entry.channel}-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Pie
                    data={channelMixWithFill}
                    dataKey="bookings"
                    nameKey="channel"
                    cx="72%"
                    cy="52%"
                    innerRadius={26}
                    outerRadius={48}
                    paddingAngle={3}
                    stroke="none"
                  >
                    {channelMixWithFill.map((entry, index) => (
                      <Cell key={`${entry.channel}-bookings-${index}`} fill={entry.fill} fillOpacity={0.9} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-center gap-10 text-[11px] font-medium text-muted-foreground">
                <span>Revenue</span>
                <span>Bookings</span>
              </div>
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-[11px]">
                {channelMixWithFill.map((entry) => (
                  <div key={entry.channel} className="flex items-center gap-1.5 text-muted-foreground">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: entry.fill }}
                    />
                    <span className="font-medium text-foreground">{entry.channel}</span>
                    <span>
                      {entry.revenuePct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </ChartCard>
        </>
      )}
    </div>
  );
}

function PropertiesAnalyticsSection({
  properties,
  selectedPropertyId,
  onSelectProperty,
}: {
  properties: Property[];
  selectedPropertyId: string;
  onSelectProperty: (id: string) => void;
}) {
  const selected = properties.find((p) => p.id === selectedPropertyId) || properties[0];
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<PropertyAnalyticsResponse | null>(null);
  const [rangePreset, setRangePreset] = useState<"30d" | "60d" | "90d" | "custom">("30d");
  const [range, setRange] = useState(() => {
    const now = new Date();
    return { from: format(addDays(now, -29), "yyyy-MM-dd"), to: format(now, "yyyy-MM-dd") };
  });

  useEffect(() => {
    if (rangePreset === "custom") return;
    const now = new Date();
    const days = rangePreset === "60d" ? 59 : rangePreset === "90d" ? 89 : 29;
    setRange({ from: format(addDays(now, -days), "yyyy-MM-dd"), to: format(now, "yyyy-MM-dd") });
  }, [rangePreset]);

  useEffect(() => {
    if (!selected?.id) return;
    const controller = new AbortController();
    const load = async () => {
      setAnalyticsLoading(true);
      setAnalyticsError(null);
      try {
        const params = new URLSearchParams({ listingId: selected.id, from: range.from, to: range.to });
        const res = await fetch(`/api/properties/analytics?${params.toString()}`, { signal: controller.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load analytics");
        setAnalytics(data);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setAnalyticsError((err as Error).message || "Failed to load analytics");
      } finally {
        setAnalyticsLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [selected?.id, range.from, range.to]);

  if (!properties.length) {
    return (
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-8 text-sm text-text-secondary">
        Activate at least one property to view analytics charts.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border-subtle bg-surface-1 p-4 flex items-center gap-3">
        <span className="text-xs text-text-tertiary uppercase tracking-wider font-semibold">Property</span>
        <select
          value={selected?.id || ""}
          onChange={(e) => onSelectProperty(e.target.value)}
          className="h-9 rounded-md border border-border-subtle bg-surface-2 px-3 text-sm text-text-primary"
        >
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {selected && (
        <PropertyAnalyticsPanel
          property={selected}
          loading={analyticsLoading}
          error={analyticsError}
          data={analytics}
          range={range}
          rangePreset={rangePreset}
          onRangePresetChange={setRangePreset}
          onRangeChange={setRange}
        />
      )}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="shadow-xl border-border dark:border-white/5 bg-background/60 dark:bg-[#111113]/60 backdrop-blur-xl overflow-hidden">
      <div className="h-px w-full bg-gradient-to-r from-blue-500/0 via-violet-500/50 to-primary/0" />
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-foreground dark:text-white">{title}</CardTitle>
        <p className="text-[11px] text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function KpiCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "blue" | "violet" | "emerald" | "amber";
}) {
  const accentMap = {
    blue: "from-blue-500/20 to-cyan-500/5 border-blue-500/20",
    violet: "from-violet-500/20 to-fuchsia-500/5 border-violet-500/20",
    emerald: "from-emerald-500/20 to-teal-500/5 border-emerald-500/20",
    amber: "from-primary/20 to-primary/85/5 border-primary/20",
  };
  const textMap = {
    blue: "text-blue-400",
    violet: "text-violet-400",
    emerald: "text-emerald-400",
    amber: "text-primary",
  };
  return (
    <Card className={cn("bg-gradient-to-br backdrop-blur-xl shadow-xl border dark:border-white/5", accentMap[accent])}>
      <CardContent className="p-3">
        <p className={cn("text-[10px] uppercase tracking-wider font-semibold", textMap[accent])}>{label}</p>
        <p className="text-base font-bold text-foreground dark:text-white mt-1 tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function DetailRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: any;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-text-tertiary shrink-0" />
      <div className="flex flex-col">
        <span className="text-[10px] text-text-disabled">{label}</span>
        <span className="text-xs font-medium text-text-primary">{value}</span>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useMemo } from "react";
import { getOrgId } from "@/lib/auth/client";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Layers,
  Loader2,
  TrendingUp,
  DollarSign,
  CalendarCheck2,
  BedDouble,
  MapPin,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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

// ── Chart constants ───────────────────────────────────────────────────────────

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
};
const CHANNEL_COLORS = ["#10b981", "#ef4444", "#3b82f6", "#8b5cf6", "#2d7ff9", "#14b8a6"];

function shortDate(d: string) {
  try { return format(parseISO(`${d}T00:00:00.000Z`), "dd MMM"); } catch { return d; }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Property {
  id: string;
  name: string;
  area: string;
  city: string;
  bedrooms: number;
  currency: string;
  isActivated: boolean;
  occupancyPct: number;
  totalRevenue: number;
  totalReservations: number;
  avgPrice: number;
  pendingProposals: number;
}

interface PropertyGroup {
  _id: string;
  name: string;
  description?: string;
  listingIds: string[];
  groupRules?: unknown[];
}

interface Ticket {
  id: string;
  listingId: string | null;
  status: string;
  severity: string;
  category: string;
  createdAt: string;
}

interface PropertyBreakdownRow {
  listingId: string;
  propertyName: string;
  totalBookings: number;
  totalRevenue: number;
  occupancyPct: number;
  avgLos: number;
}

interface PropertyAnalyticsResponse {
  listingId: string;
  propertyName: string;
  scope?: "property" | "portfolio";
  propertyCount?: number;
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
  propertyBreakdown?: PropertyBreakdownRow[];
}

const PORTFOLIO_ID = "portfolio";

// ── Shared helpers ─────────────────────────────────────────────────────────────

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
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

function KpiCard({ label, value, accent }: { label: string; value: string; accent: "blue" | "violet" | "emerald" | "amber" }) {
  const accentMap = {
    blue: "from-blue-500/20 to-cyan-500/5 border-blue-500/20",
    violet: "from-violet-500/20 to-fuchsia-500/5 border-violet-500/20",
    emerald: "from-emerald-500/20 to-teal-500/5 border-emerald-500/20",
    amber: "from-primary/20 to-primary/85/5 border-primary/20",
  };
  const textMap = { blue: "text-blue-400", violet: "text-violet-400", emerald: "text-emerald-400", amber: "text-primary" };
  return (
    <Card className={cn("bg-gradient-to-br backdrop-blur-xl shadow-xl border dark:border-white/5", accentMap[accent])}>
      <CardContent className="p-3">
        <p className={cn("text-[10px] uppercase tracking-wider font-semibold", textMap[accent])}>{label}</p>
        <p className="text-base font-bold text-foreground dark:text-white mt-1 tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

// ── Date range controls ────────────────────────────────────────────────────────

function DateRangeControls({
  rangePreset,
  range,
  onPresetChange,
  onRangeChange,
}: {
  rangePreset: string;
  range: { from: string; to: string };
  onPresetChange: (p: "30d" | "60d" | "90d" | "custom") => void;
  onRangeChange: (r: { from: string; to: string }) => void;
}) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-1 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-text-tertiary uppercase tracking-wider font-semibold">Analytics Window</span>
        <div className="flex gap-1.5">
          {(["30d", "60d", "90d", "custom"] as const).map((p) => (
            <button
              key={p}
              onClick={() => onPresetChange(p)}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
                rangePreset === p ? "bg-amber text-black" : "bg-surface-2 text-text-secondary hover:text-text-primary"
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-3">
        <input
          type="date"
          value={range.from}
          onChange={(e) => { onPresetChange("custom"); onRangeChange({ ...range, from: e.target.value }); }}
          className="flex-1 h-9 rounded-md border border-border-subtle bg-surface-2 px-3 text-sm text-text-primary"
        />
        <input
          type="date"
          value={range.to}
          onChange={(e) => { onPresetChange("custom"); onRangeChange({ ...range, to: e.target.value }); }}
          className="flex-1 h-9 rounded-md border border-border-subtle bg-surface-2 px-3 text-sm text-text-primary"
        />
      </div>
    </div>
  );
}

// ── Property Analytics Panel ───────────────────────────────────────────────────

function PropertyAnalyticsPanel({
  property,
  loading,
  error,
  data,
  isPortfolio = false,
}: {
  property: Property;
  loading: boolean;
  error: string | null;
  data: PropertyAnalyticsResponse | null;
  isPortfolio?: boolean;
}) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 text-amber animate-spin" />
        <p className="text-text-tertiary text-sm">Loading analytics…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-6 text-rose-400 text-sm">{error}</div>
    );
  }
  if (!data) return null;

  const channelMixWithFill = data.channelMix.map((c, i) => ({ ...c, fill: CHANNEL_COLORS[i % CHANNEL_COLORS.length] }));

  return (
    <div className="space-y-4">
      <div className={cn("grid gap-3", isPortfolio ? "grid-cols-2 md:grid-cols-5" : "grid-cols-2 md:grid-cols-4")}>
        {isPortfolio && (
          <KpiCard
            label="Properties"
            value={String(data.propertyCount ?? 0)}
            accent="violet"
          />
        )}
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
            <RechartTooltip contentStyle={CHART_TOOLTIP_STYLE} labelFormatter={(v) => format(parseISO(`${String(v)}T00:00:00.000Z`), "dd MMM yyyy")} />
            <Legend />
            <Bar dataKey="bookings" name="Bookings" fill={ANALYTICS_COLORS.blue} radius={[6, 6, 0, 0]} />
            <Line type="monotone" dataKey="movingAvg7d" name="7d Avg" stroke={ANALYTICS_COLORS.amber} strokeWidth={3} dot={false} />
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
              <linearGradient id="occFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={ANALYTICS_COLORS.emerald} stopOpacity={0.45} />
                <stop offset="95%" stopColor={ANALYTICS_COLORS.emerald} stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="occupancyPct" name="Occupancy %" stroke={ANALYTICS_COLORS.emerald} fill="url(#occFill)" strokeWidth={3} />
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

      {channelMixWithFill.length > 0 && (
        <ChartCard title="Revenue by Channel" subtitle="Revenue and booking contribution by channel">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <RechartTooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                formatter={(value: number, _name: string, item: { dataKey?: string | number }) => {
                  return item?.dataKey === "revenue"
                    ? [`${property.currency} ${value.toLocaleString("en-US")}`, "Revenue" as const]
                    : [value, "Bookings" as const];
                }}
                labelFormatter={(_label: string, payload: { payload?: { channel?: string } }[]) => payload?.[0]?.payload?.channel || ""}
              />
              <Pie data={channelMixWithFill} dataKey="revenue" nameKey="channel" cx="32%" cy="52%" innerRadius={38} outerRadius={70} paddingAngle={4} stroke="none">
                {channelMixWithFill.map((entry, index) => <Cell key={`rev-${index}`} fill={entry.fill} />)}
              </Pie>
              <Pie data={channelMixWithFill} dataKey="bookings" nameKey="channel" cx="72%" cy="52%" innerRadius={26} outerRadius={48} paddingAngle={3} stroke="none">
                {channelMixWithFill.map((entry, index) => <Cell key={`bk-${index}`} fill={entry.fill} fillOpacity={0.9} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-center gap-10 text-[11px] font-medium text-muted-foreground mt-1">
            <span>Revenue</span><span>Bookings</span>
          </div>
          <div className="flex flex-wrap gap-2 mt-3 justify-center">
            {channelMixWithFill.map((c) => (
              <div key={c.channel} className="flex items-center gap-1.5 text-[10px] text-text-secondary">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.fill }} />
                {c.channel}
              </div>
            ))}
          </div>
        </ChartCard>
      )}
    </div>
  );
}

// ── Portfolio property breakdown charts ────────────────────────────────────────

function PortfolioBreakdownCharts({
  breakdown,
  currency,
}: {
  breakdown: PropertyBreakdownRow[];
  currency: string;
}) {
  const chartData = useMemo(() => {
    return breakdown.map((p, i) => ({
      name: shortPropName(p.propertyName),
      fullName: p.propertyName,
      revenue: p.totalRevenue,
      occupancy: p.occupancyPct,
      reservations: p.totalBookings,
      fill: CHANNEL_COLORS[i % CHANNEL_COLORS.length],
      revenuePct: 0,
    }));
  }, [breakdown]);

  const chartDataWithPct = useMemo(() => {
    const total = chartData.reduce((s, d) => s + d.revenue, 0);
    return chartData.map((d) => ({
      ...d,
      revenuePct: total > 0 ? Math.round((d.revenue / total) * 100) : 0,
    }));
  }, [chartData]);

  if (!breakdown.length) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard title="Revenue Share" subtitle="Each property's contribution to portfolio revenue">
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <RechartTooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              formatter={(value: number) => [`${currency} ${value.toLocaleString("en-US")}`, "Revenue"]}
              labelFormatter={(_: string, payload: { payload?: { fullName?: string } }[]) =>
                payload?.[0]?.payload?.fullName || ""
              }
            />
            <Pie
              data={chartDataWithPct}
              dataKey="revenue"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={90}
              paddingAngle={3}
              stroke="none"
              label={({ name, revenuePct }) => `${name} ${revenuePct}%`}
              labelLine={false}
            >
              {chartDataWithPct.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Occupancy %" subtitle="Occupancy rate per property in this window">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartDataWithPct} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} strokeOpacity={0.2} />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: CHART_AXIS_STROKE }} unit="%" />
            <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10, fill: CHART_AXIS_STROKE }} />
            <RechartTooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              formatter={(v: number) => [`${v}%`, "Occupancy"]}
              labelFormatter={(_: string, payload: { payload?: { fullName?: string } }[]) =>
                payload?.[0]?.payload?.fullName || ""
              }
            />
            <Bar dataKey="occupancy" name="Occupancy %" radius={[0, 4, 4, 0]} maxBarSize={18}>
              {chartDataWithPct.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

// ── Properties Analytics Section ───────────────────────────────────────────────

function PropertiesAnalytics({ properties, tickets }: { properties: Property[]; tickets: Ticket[] }) {
  const [selectedId, setSelectedId] = useState<string>(PORTFOLIO_ID);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PropertyAnalyticsResponse | null>(null);
  const [rangePreset, setRangePreset] = useState<"30d" | "60d" | "90d" | "custom">("30d");
  const [range, setRange] = useState(() => {
    const now = new Date();
    return { from: format(addDays(now, -29), "yyyy-MM-dd"), to: format(now, "yyyy-MM-dd") };
  });

  const activeProps = useMemo(() => properties.filter((p) => p.isActivated), [properties]);
  const isPortfolio = selectedId === PORTFOLIO_ID;
  const selected = activeProps.find((p) => p.id === selectedId);
  const currency = activeProps[0]?.currency || "AED";
  const viewProperty: Property = isPortfolio
    ? {
        id: PORTFOLIO_ID,
        name: "Portfolio",
        area: "",
        city: "",
        bedrooms: 0,
        currency,
        isActivated: true,
        occupancyPct: 0,
        totalRevenue: 0,
        totalReservations: 0,
        avgPrice: 0,
        pendingProposals: 0,
      }
    : (selected ?? activeProps[0]);

  const scopedListingIds = useMemo(() => {
    if (isPortfolio) return new Set(activeProps.map((p) => p.id));
    if (selected) return new Set([selected.id]);
    return new Set<string>();
  }, [isPortfolio, activeProps, selected]);

  const scopedTickets = useMemo(() => {
    return tickets.filter((tk) => {
      if (!tk.listingId || !scopedListingIds.has(tk.listingId)) return false;
      const d = tk.createdAt.slice(0, 10);
      return d >= range.from && d <= range.to;
    });
  }, [tickets, scopedListingIds, range]);

  const propTickets = useMemo(() => {
    const open = scopedTickets.filter((tk) => tk.status === "open").length;
    const resolved = scopedTickets.filter((tk) => tk.status === "resolved" || tk.status === "closed").length;
    return {
      total: scopedTickets.length,
      open,
      resolved,
      resolvedRate: scopedTickets.length > 0 ? Math.round((resolved / scopedTickets.length) * 100) : 0,
    };
  }, [scopedTickets]);

  const severityData = useMemo(() => {
    const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    scopedTickets.forEach((tk) => { counts[tk.severity] = (counts[tk.severity] ?? 0) + 1; });
    return Object.entries(counts).map(([severity, count]) => ({ severity, count }));
  }, [scopedTickets]);

  useEffect(() => {
    if (rangePreset === "custom") return;
    const now = new Date();
    const days = rangePreset === "60d" ? 59 : rangePreset === "90d" ? 89 : 29;
    setRange({ from: format(addDays(now, -days), "yyyy-MM-dd"), to: format(now, "yyyy-MM-dd") });
  }, [rangePreset]);

  useEffect(() => {
    if (!activeProps.length) return;
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const listingParam = isPortfolio ? PORTFOLIO_ID : (selected?.id ?? activeProps[0].id);
        const params = new URLSearchParams({ listingId: listingParam, from: range.from, to: range.to });
        const res = await fetch(`/api/properties/analytics?${params}`, { signal: controller.signal });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load analytics");
        setData(json);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [activeProps, isPortfolio, selected?.id, range.from, range.to]);

  if (!activeProps.length) {
    return (
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-8 text-sm text-text-secondary text-center">
        Activate at least one property to view analytics.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border-subtle bg-surface-1 p-4 flex items-center gap-3">
        <span className="text-xs text-text-tertiary uppercase tracking-wider font-semibold shrink-0">View</span>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="flex-1 h-9 rounded-md border border-border-subtle bg-surface-2 px-3 text-sm text-text-primary"
        >
          <option value={PORTFOLIO_ID}>
            All properties - portfolio ({activeProps.length})
          </option>
          <optgroup label="Individual properties">
            {activeProps.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </optgroup>
        </select>
      </div>

      <DateRangeControls rangePreset={rangePreset} range={range} onPresetChange={setRangePreset} onRangeChange={setRange} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="grid grid-cols-3 gap-3">
          <KpiCard label="Total Tickets" value={String(propTickets.total)} accent="violet" />
          <KpiCard label="Open / Active" value={String(propTickets.open)} accent="blue" />
          <KpiCard label="Resolved Rate" value={`${propTickets.resolvedRate}%`} accent="emerald" />
        </div>
        <ChartCard
          title="Ticket Severity Breakdown"
          subtitle={isPortfolio ? "Escalation tickets across the portfolio" : "Escalation tickets for this property"}
        >
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={severityData} margin={{ left: 0, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} strokeOpacity={0.2} />
              <XAxis dataKey="severity" tick={{ fontSize: 10, fill: CHART_AXIS_STROKE }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: CHART_AXIS_STROKE }} />
              <RechartTooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number) => [v, "Tickets"]} />
              <Bar dataKey="count" name="Tickets" radius={[4, 4, 0, 0]} maxBarSize={36}>
                {severityData.map((entry, i) => (
                  <Cell key={i} fill={
                    entry.severity === "critical" ? "#ef4444" :
                    entry.severity === "high" ? "#f97316" :
                    entry.severity === "medium" ? "#eab308" : "#3b82f6"
                  } />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {viewProperty && (
        <>
          <PropertyAnalyticsPanel
            property={viewProperty}
            loading={loading}
            error={error}
            data={data}
            isPortfolio={isPortfolio}
          />
          {isPortfolio && data?.propertyBreakdown && data.propertyBreakdown.length > 0 && (
            <PortfolioBreakdownCharts breakdown={data.propertyBreakdown} currency={currency} />
          )}
        </>
      )}
    </div>
  );
}

// ── Groups Analytics Section ───────────────────────────────────────────────────

// Shorten long property names for chart axes
function shortPropName(name: string, max = 18): string {
  if (name.length <= max) return name;
  // Try to get first meaningful segment before "|"
  const seg = name.split("|")[0].trim();
  return seg.length <= max ? seg : seg.slice(0, max - 1) + "…";
}

function GroupsAnalytics({ groups, properties, tickets }: { groups: PropertyGroup[]; properties: Property[]; tickets: Ticket[] }) {
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
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

  const propertyMap = useMemo(() => {
    const m: Record<string, Property> = {};
    properties.forEach((p) => { m[p.id] = p; });
    return m;
  }, [properties]);

  const selectedGroup = groups.find((g) => g._id === selectedGroupId) || groups[0];

  const memberProperties = useMemo(() => {
    if (!selectedGroup) return [];
    return selectedGroup.listingIds.map((id) => propertyMap[id]).filter(Boolean);
  }, [selectedGroup, propertyMap]);

  const groupStats = useMemo(() => {
    if (!memberProperties.length) return null;
    const totalRevenue = memberProperties.reduce((s, p) => s + p.totalRevenue, 0);
    const totalReservations = memberProperties.reduce((s, p) => s + p.totalReservations, 0);
    const avgOccupancy = Math.round(memberProperties.reduce((s, p) => s + p.occupancyPct, 0) / memberProperties.length);
    const avgPrice = Math.round(memberProperties.reduce((s, p) => s + p.avgPrice, 0) / memberProperties.length);
    const pendingProposals = memberProperties.reduce((s, p) => s + p.pendingProposals, 0);
    const currency = memberProperties[0]?.currency || "AED";
    return { totalRevenue, totalReservations, avgOccupancy, avgPrice, pendingProposals, currency };
  }, [memberProperties]);

  // Chart-ready data derived from member properties
  const chartData = useMemo(() => {
    return memberProperties.map((p, i) => ({
      name: shortPropName(p.name),
      fullName: p.name,
      revenue: p.totalRevenue,
      occupancy: p.occupancyPct,
      reservations: p.totalReservations,
      avgPrice: p.avgPrice,
      pendingProposals: p.pendingProposals,
      fill: CHANNEL_COLORS[i % CHANNEL_COLORS.length],
      revenuePct: 0, // filled below
    }));
  }, [memberProperties]);

  const chartDataWithPct = useMemo(() => {
    const total = chartData.reduce((s, d) => s + d.revenue, 0);
    return chartData.map((d) => ({
      ...d,
      revenuePct: total > 0 ? Math.round((d.revenue / total) * 100) : 0,
    }));
  }, [chartData]);

  // Per-property ticket stats for group members
  const ticketChartData = useMemo(() => {
    return memberProperties.map((p, i) => {
      const propTickets = tickets.filter((tk) => tk.listingId === p.id);
      const open = propTickets.filter((tk) => tk.status === "open").length;
      const resolved = propTickets.filter((tk) => tk.status === "resolved" || tk.status === "closed").length;
      const resolvedRate = propTickets.length > 0 ? Math.round((resolved / propTickets.length) * 100) : 0;
      return {
        name: shortPropName(p.name),
        fullName: p.name,
        id: p.id,
        open,
        resolved,
        resolvedRate,
        total: propTickets.length,
        fill: CHANNEL_COLORS[i % CHANNEL_COLORS.length],
      };
    });
  }, [memberProperties, tickets]);

  // Filter tickets by date range for group members
  const filteredGroupTickets = useMemo(() => {
    const memberIds = new Set(memberProperties.map((p) => p.id));
    return tickets.filter((tk) => {
      if (!tk.listingId || !memberIds.has(tk.listingId)) return false;
      const d = tk.createdAt.slice(0, 10);
      return d >= range.from && d <= range.to;
    });
  }, [tickets, memberProperties, range]);

  const groupTicketStats = useMemo(() => {
    const open = filteredGroupTickets.filter((tk) => tk.status === "open").length;
    const resolved = filteredGroupTickets.filter((tk) => tk.status === "resolved" || tk.status === "closed").length;
    return {
      total: filteredGroupTickets.length,
      open,
      resolved,
      resolvedRate: filteredGroupTickets.length > 0 ? Math.round((resolved / filteredGroupTickets.length) * 100) : 0,
    };
  }, [filteredGroupTickets]);

  useEffect(() => {
    if (groups.length && !selectedGroupId) setSelectedGroupId(groups[0]._id);
  }, [groups, selectedGroupId]);

  if (!groups.length) {
    return (
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-8 text-sm text-text-secondary text-center">
        No groups found. Create groups from the Groups page first.
      </div>
    );
  }

  const currency = groupStats?.currency || "AED";

  return (
    <div className="space-y-5">
      {/* Group selector */}
      <div className="rounded-xl border border-border-subtle bg-surface-1 p-4 flex items-center gap-3">
        <span className="text-xs text-text-tertiary uppercase tracking-wider font-semibold shrink-0">Group</span>
        <select
          value={selectedGroup?._id || ""}
          onChange={(e) => setSelectedGroupId(e.target.value)}
          className="flex-1 h-9 rounded-md border border-border-subtle bg-surface-2 px-3 text-sm text-text-primary"
        >
          {groups.map((g) => (
            <option key={g._id} value={g._id}>{g.name}</option>
          ))}
        </select>
      </div>

      {/* Analytics window */}
      <DateRangeControls rangePreset={rangePreset} range={range} onPresetChange={setRangePreset} onRangeChange={setRange} />

      {selectedGroup && groupStats && memberProperties.length > 0 && (
        <>
          {/* KPI cards - property metrics */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <KpiCard label="Properties" value={String(memberProperties.length)} accent="violet" />
            <KpiCard label="Total Reservations" value={groupStats.totalReservations.toLocaleString("en-US")} accent="blue" />
            <KpiCard label="Avg Occupancy" value={`${groupStats.avgOccupancy}%`} accent="emerald" />
            <KpiCard label="Avg Price" value={`${currency} ${groupStats.avgPrice.toLocaleString("en-US")}`} accent="violet" />
            <KpiCard label="Total Revenue" value={`${currency} ${groupStats.totalRevenue.toLocaleString("en-US")}`} accent="amber" />
          </div>

          {/* Escalation ticket KPIs (date-range filtered) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Tickets (window)" value={String(groupTicketStats.total)} accent="violet" />
            <KpiCard label="Active Tickets" value={String(groupTicketStats.open)} accent="blue" />
            <KpiCard label="Resolved" value={String(groupTicketStats.resolved)} accent="emerald" />
            <KpiCard label="Resolved Rate" value={`${groupTicketStats.resolvedRate}%`} accent="amber" />
          </div>

          {/* Row 1: Revenue Pie + Occupancy Bar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Revenue share - Pie */}
            <ChartCard title="Revenue Share" subtitle="Each property's contribution to group revenue">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <RechartTooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(value: number) => [`${currency} ${value.toLocaleString("en-US")}`, "Revenue"]}
                    labelFormatter={(_: string, payload: { payload?: { fullName?: string } }[]) =>
                      payload?.[0]?.payload?.fullName || ""
                    }
                  />
                  <Pie
                    data={chartDataWithPct}
                    dataKey="revenue"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={3}
                    stroke="none"
                    label={({ name, revenuePct }) => `${name} ${revenuePct}%`}
                    labelLine={false}
                  >
                    {chartDataWithPct.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              {/* Legend */}
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-1 justify-center">
                {chartDataWithPct.map((d) => (
                  <div key={d.name} className="flex items-center gap-1.5 text-[10px] text-text-secondary">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.fill }} />
                    {d.name}
                  </div>
                ))}
              </div>
            </ChartCard>

            {/* Occupancy - Horizontal bar */}
            <ChartCard title="Occupancy %" subtitle="30-day occupancy rate per property">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartDataWithPct} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} strokeOpacity={0.2} horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: CHART_AXIS_STROKE }} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: CHART_AXIS_STROKE }} width={80} />
                  <RechartTooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(v: number) => [`${v}%`, "Occupancy"]}
                    labelFormatter={(_: string, payload: { payload?: { fullName?: string } }[]) =>
                      payload?.[0]?.payload?.fullName || ""
                    }
                  />
                  <Bar dataKey="occupancy" name="Occupancy %" radius={[0, 6, 6, 0]} maxBarSize={22}>
                    {chartDataWithPct.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Row 2: Revenue bar + Avg Price bar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Revenue - vertical bar */}
            <ChartCard title="Revenue by Property" subtitle={`Total revenue in ${currency}`}>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartDataWithPct} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} strokeOpacity={0.2} />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: CHART_AXIS_STROKE }} interval={0} />
                  <YAxis tick={{ fontSize: 10, fill: CHART_AXIS_STROKE }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <RechartTooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(v: number) => [`${currency} ${v.toLocaleString("en-US")}`, "Revenue"]}
                    labelFormatter={(_: string, payload: { payload?: { fullName?: string } }[]) =>
                      payload?.[0]?.payload?.fullName || ""
                    }
                  />
                  <Bar dataKey="revenue" name="Revenue" radius={[6, 6, 0, 0]} maxBarSize={40}>
                    {chartDataWithPct.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Avg Price - vertical bar */}
            <ChartCard title="Avg Nightly Price" subtitle={`Average price per night in ${currency}`}>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartDataWithPct} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} strokeOpacity={0.2} />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: CHART_AXIS_STROKE }} interval={0} />
                  <YAxis tick={{ fontSize: 10, fill: CHART_AXIS_STROKE }} />
                  <RechartTooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(v: number) => [`${currency} ${v.toLocaleString("en-US")}`, "Avg Price"]}
                    labelFormatter={(_: string, payload: { payload?: { fullName?: string } }[]) =>
                      payload?.[0]?.payload?.fullName || ""
                    }
                  />
                  <Bar dataKey="avgPrice" name="Avg Price" radius={[6, 6, 0, 0]} maxBarSize={40}>
                    {chartDataWithPct.map((entry, i) => (
                      <Cell key={i} fill={ANALYTICS_COLORS.violet} fillOpacity={0.7 + (i % 3) * 0.1} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Row 3: Reservations bar + Pending Proposals bar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Reservations - vertical bar */}
            <ChartCard title="Reservations by Property" subtitle="Total bookings per property">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartDataWithPct} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} strokeOpacity={0.2} />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: CHART_AXIS_STROKE }} interval={0} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: CHART_AXIS_STROKE }} />
                  <RechartTooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(v: number) => [v, "Reservations"]}
                    labelFormatter={(_: string, payload: { payload?: { fullName?: string } }[]) =>
                      payload?.[0]?.payload?.fullName || ""
                    }
                  />
                  <Bar dataKey="reservations" name="Reservations" radius={[6, 6, 0, 0]} maxBarSize={40}>
                    {chartDataWithPct.map((entry, i) => (
                      <Cell key={i} fill={ANALYTICS_COLORS.blue} fillOpacity={0.65 + (i % 4) * 0.08} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Pending Proposals - vertical bar */}
            <ChartCard title="Pending Proposals" subtitle="AI pricing proposals awaiting review">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartDataWithPct} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} strokeOpacity={0.2} />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: CHART_AXIS_STROKE }} interval={0} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: CHART_AXIS_STROKE }} />
                  <RechartTooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(v: number) => [v, "Pending"]}
                    labelFormatter={(_: string, payload: { payload?: { fullName?: string } }[]) =>
                      payload?.[0]?.payload?.fullName || ""
                    }
                  />
                  <Bar dataKey="pendingProposals" name="Pending" radius={[6, 6, 0, 0]} maxBarSize={40}>
                    {chartDataWithPct.map((entry, i) => (
                      <Cell key={i} fill={ANALYTICS_COLORS.amber} fillOpacity={0.65 + (i % 4) * 0.08} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Per-property summary table */}
          <div className="rounded-xl border border-border-subtle bg-surface-1 overflow-hidden">
            <div className="px-4 py-3 border-b border-border-subtle flex items-center gap-2">
              <Layers className="h-4 w-4 text-amber" />
              <span className="text-xs font-bold text-text-tertiary uppercase tracking-wider">
                {memberProperties.length} {memberProperties.length === 1 ? "Property" : "Properties"} - Detailed Breakdown
              </span>
            </div>
            <div className="divide-y divide-border-subtle">
              {memberProperties.map((prop, i) => {
                const revPct = groupStats.totalRevenue > 0
                  ? Math.round((prop.totalRevenue / groupStats.totalRevenue) * 100) : 0;
                return (
                  <div key={prop.id} className="px-4 py-3 flex items-center gap-4 hover:bg-surface-2/40 transition-colors">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHANNEL_COLORS[i % CHANNEL_COLORS.length] }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate">{prop.name}</p>
                      <div className="flex items-center gap-2 text-[10px] text-text-tertiary mt-0.5">
                        <MapPin className="h-2.5 w-2.5" />
                        <span>{prop.area || prop.city || "-"}</span>
                        <span>·</span>
                        <BedDouble className="h-2.5 w-2.5" />
                        <span>{prop.bedrooms} BR</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-6 text-center shrink-0">
                      <div>
                        <p className="text-[10px] text-text-disabled uppercase tracking-wider">Occ.</p>
                        <p className="text-sm font-bold text-text-primary tabular-nums">{prop.occupancyPct}%</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-text-disabled uppercase tracking-wider">Reserv.</p>
                        <p className="text-sm font-bold text-text-primary tabular-nums">{prop.totalReservations}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-text-disabled uppercase tracking-wider">Avg Price</p>
                        <p className="text-sm font-bold text-text-primary tabular-nums">{prop.currency} {prop.avgPrice.toLocaleString("en-US")}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-text-disabled uppercase tracking-wider">Revenue</p>
                        <p className="text-sm font-bold text-amber tabular-nums">
                          {prop.currency} {prop.totalRevenue.toLocaleString("en-US")}
                          <span className="text-[9px] text-text-disabled ml-1">({revPct}%)</span>
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {selectedGroup && memberProperties.length === 0 && (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-8 text-sm text-text-secondary text-center">
          No properties in this group yet.
        </div>
      )}
    </div>
  );
}

// ── Main Analytics Page ────────────────────────────────────────────────────────

type AnalyticsTab = "properties" | "groups";

export default function AnalyticsPage() {
  const [tab, setTab] = useState<AnalyticsTab>("properties");
  const [properties, setProperties] = useState<Property[]>([]);
  const [groups, setGroups] = useState<PropertyGroup[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const orgId = getOrgId();
      if (!orgId) { setLoading(false); return; }
      try {
        const [propsRes, groupsRes, ticketsRes] = await Promise.all([
          fetch(`/api/properties?orgId=${orgId}`),
          fetch(`/api/groups?orgId=${orgId}`),
          fetch(`/api/guest-agent/tickets?orgId=${orgId}`),
        ]);
        const propsData = propsRes.ok ? await propsRes.json() : {};
        const groupsData = groupsRes.ok ? await groupsRes.json() : {};
        const ticketsData = ticketsRes.ok ? await ticketsRes.json() : {};
        setProperties(propsData.properties || []);
        const rawGroups = Array.isArray(groupsData) ? groupsData : groupsData?.groups ?? [];
        setGroups(rawGroups);
        setTickets(ticketsData.tickets || []);
      } catch {
        // proceed with empty state
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const tabs: { id: AnalyticsTab; label: string; icon: React.ElementType; count: number }[] = [
    { id: "properties", label: "Properties", icon: BarChart3, count: properties.filter((p) => p.isActivated).length },
    { id: "groups", label: "Groups", icon: Layers, count: groups.length },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Analytics</h1>
          <p className="text-sm text-text-tertiary mt-1">
            Revenue, occupancy, and booking insights across your portfolio and groups.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 border-b border-border-default">
          {tabs.map(({ id, label, icon: Icon, count }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === id
                  ? "border-amber text-amber"
                  : "border-transparent text-text-secondary hover:text-text-primary hover:border-border-default"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                tab === id ? "bg-amber/10 text-amber" : "bg-white/5 text-text-disabled"
              )}>
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-4">
            {/* Property/Group Selector Skeleton */}
            <div className="rounded-xl border border-border-subtle bg-surface-1 p-4 flex items-center gap-3">
              <Skeleton className="h-4 w-16 shrink-0" />
              <Skeleton className="flex-1 h-9 rounded-md" />
            </div>

            {/* Date Range Controls Skeleton */}
            <div className="rounded-xl border border-border-subtle bg-surface-1 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-32" />
                <div className="flex gap-1.5">
                  <Skeleton className="h-6 w-10" />
                  <Skeleton className="h-6 w-10" />
                  <Skeleton className="h-6 w-10" />
                  <Skeleton className="h-6 w-14" />
                </div>
              </div>
              <div className="flex gap-3">
                <Skeleton className="flex-1 h-9 rounded-md" />
                <Skeleton className="flex-1 h-9 rounded-md" />
              </div>
            </div>

            {/* KPI Cards Skeleton */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-border-subtle bg-surface-1 p-4 flex flex-col gap-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-6 w-24 mt-1" />
                </div>
              ))}
            </div>

            {/* Charts Skeleton */}
            <div className="grid grid-cols-1 gap-4">
              <div className="rounded-xl border border-border-subtle bg-surface-1 p-5 flex flex-col gap-3 h-[300px]">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-64" />
                <Skeleton className="w-full flex-1 mt-4" />
              </div>
              <div className="rounded-xl border border-border-subtle bg-surface-1 p-5 flex flex-col gap-3 h-[300px]">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-64" />
                <Skeleton className="w-full flex-1 mt-4" />
              </div>
            </div>
          </div>
        ) : tab === "properties" ? (
          <PropertiesAnalytics properties={properties} tickets={tickets} />
        ) : (
          <GroupsAnalytics groups={groups} properties={properties} tickets={tickets} />
        )}
      </div>
    </div>
  );
}

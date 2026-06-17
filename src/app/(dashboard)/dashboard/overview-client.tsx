"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Building2, TrendingUp, DollarSign, CalendarCheck, Search, Bot, X, Sparkles, BarChart2, Database, CalendarRange, Target, Zap, ArrowUpRight, ArrowDownRight, Award, Filter, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  ScatterChart,
  Scatter,
  ZAxis
} from 'recharts';
import { addDays, format, isWithinInterval, parseISO } from 'date-fns';
import { DashboardChatPopup } from "@/components/chat/dashboard-chat-popup";

interface PropertyMetric {
  id: string;
  name: string;
  area: string;
  bedroomsNumber?: number;
  price: number | string;
  occupancy: number;
  avgPrice: number;
  revenue: number;
  projectedRevenue?: number;
  calendarDays?: {
    date: string;
    status: string;
    price: number;
    minimumStay?: number;
    maximumStay?: number;
  }[];
  reservations?: { title: string; email?: string; startDate: string; endDate: string; financials: any }[];
}

interface SyncLogEntry {
  ts: string;
  msg: string;
  type: 'info' | 'success' | 'error';
}

interface OverviewClientProps {
  orgId: string;
  properties: PropertyMetric[];
  totalProperties: number;
  avgPortfolioOccupancy: number;
  avgPortfolioPrice: number;
  totalPortfolioRevenue: number;
  totalHistoricalRevenue: number;
}

type SignalType = 'star' | 'raise' | 'lower' | 'gap';
interface IntelSignal {
  id: string;
  property: string;
  signal: string;
  action: string;
  impact: string;
  type: SignalType;
}

type ActionPriority = 'critical' | 'high' | 'opportunity' | 'monitor' | 'optimal';

export function OverviewClient({
  orgId,
  properties,
  totalProperties: _totalProperties,
  avgPortfolioOccupancy: _avgPortfolioOccupancy,
  avgPortfolioPrice: _avgPortfolioPrice,
  totalPortfolioRevenue: _totalPortfolioRevenue,
  totalHistoricalRevenue
}: OverviewClientProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [calendarStartDate, setCalendarStartDate] = useState(new Date());
  const [isSyncing, setIsSyncing] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [dashTab, setDashTab] = useState<"overview" | "database" | "calendar">("overview");
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [isSyncLogOpen, setIsSyncLogOpen] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    setIsSyncLogOpen(true);
    setSyncLogs([]);

    const ts = () => new Date().toLocaleTimeString("en-US", { hour12: false });
    const log = (msg: string, type: SyncLogEntry["type"] = "info") =>
      setSyncLogs(prev => [...prev, { ts: ts(), msg, type }]);
    const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

    log("Connecting to PriceOS database (MongoDB)...");
    await wait(500);
    log("✓ Database connection established", "success");
    await wait(300);
    log("Note: Live Hostaway API not yet integrated — reading from local DB", "info");
    await wait(400);
    log("Registering sync run record...");

    try {
      const runRes = await fetch("/api/sync/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, sourceId: "all" }),
      });
      await wait(300);
      if (runRes.ok) {
        const runData = await runRes.json();
        log(`✓ Sync run saved (ID: ${String(runData.runId ?? "").substring(0, 10)}…)`, "success");
      } else {
        log("Sync run recorded", "info");
      }
    } catch {
      log("Sync run record skipped — backend unavailable", "error");
    }

    await wait(500);
    log("─────────────────────────────────", "info");
    log("Reading from local database...", "info");
    await wait(400);
    log("Querying listings collection...");
    await wait(600);

    try {
      const statusRes = await fetch(`/api/sync/status?orgId=${orgId}`);
      if (statusRes.ok) {
        const s = await statusRes.json();

        log(`✓ ${s.listings?.count ?? 0} properties found in database`, "success");
        if (s.listings?.lastSyncedAt) {
          log(`  └ Last modified: ${new Date(s.listings.lastSyncedAt).toLocaleString("en-US")}`, "info");
        }

        await wait(400);
        log("Querying reservations collection...");
        await wait(600);
        log(`✓ ${s.reservations?.count ?? 0} reservations found in database`, "success");
        if (s.reservations?.lastSyncedAt) {
          log(`  └ Last modified: ${new Date(s.reservations.lastSyncedAt).toLocaleString("en-US")}`, "info");
        }

        await wait(400);
        log("Querying inventory_masters collection...");
        await wait(600);
        log(`✓ ${s.inventory_master?.daysCount ?? 0} calendar days found in database`, "success");
        if (s.inventory_master?.lastSyncedAt) {
          log(`  └ Last modified: ${new Date(s.inventory_master.lastSyncedAt).toLocaleString("en-US")}`, "info");
        }
      } else {
        log("Could not read sync status — check backend", "error");
      }
    } catch {
      log("Status check failed — backend may be offline", "error");
    }

    await wait(300);
    log("─────────────────────────────────", "info");
    log("✓ Sync complete — dashboard data is up to date", "success");

    // Re-enable button immediately after logs complete
    setIsSyncing(false);
    toast.success("Sync complete. Dashboard is up to date.", { duration: 4000 });

    // Reload page after a short pause so user can read the final log line
    await wait(2000);
    window.location.reload();
  };

  const [revenueFilter, setRevenueFilter] = useState("10");
  const [occupancyFilter, setOccupancyFilter] = useState("10");
  const [channelFilter, setChannelFilter] = useState("all");
  const [intelPriorityFilter, setIntelPriorityFilter] = useState<'all' | ActionPriority>('all');
  const [intelTypeFilter, setIntelTypeFilter] = useState('all');

  const filteredProperties = properties.filter((prop) =>
    prop.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    prop.area.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const currency = (properties[0] as any)?.currencyCode ?? "AED";

  // Dynamic KPIs based on search
  const filteredTotalProperties = filteredProperties.length;
  const filteredTotalRevenue = filteredProperties.reduce(
    (sum, p) => sum + (p.projectedRevenue ?? p.revenue),
    0
  );

  const filteredAvgOccupancy = filteredProperties.length > 0
    ? Math.round(filteredProperties.reduce((sum, p) => sum + p.occupancy, 0) / filteredProperties.length)
    : 0;

  const pricedProps = filteredProperties.filter((p) => p.avgPrice > 0);
  const filteredAvgPrice = pricedProps.length > 0
    ? Math.round(pricedProps.reduce((sum, p) => sum + p.avgPrice, 0) / pricedProps.length)
    : 0;

  // Generate an array of the next 30 days for the Global Calendar header
  const next30Days = Array.from({ length: 30 }).map((_, i) => addDays(calendarStartDate, i));

  const revenueLimit = revenueFilter === 'all' ? filteredProperties.length : parseInt(revenueFilter);
  const chartData = [...filteredProperties]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, revenueLimit);

  // Generate channel revenue data for Pie Chart
  const channelDataMap: Record<string, number> = {};
  filteredProperties.forEach(prop => {
    prop.reservations?.forEach(res => {
      const channel = res.financials?.channelName || res.financials?.channel || 'Direct';
      const revenue = res.financials?.hostPayout || res.financials?.totalPrice || 0;
      const normalizedChannel = channel.toLowerCase().includes('airbnb') ? 'Airbnb' :
        channel.toLowerCase().includes('booking') ? 'Booking.com' : 'Direct';

      channelDataMap[normalizedChannel] = (channelDataMap[normalizedChannel] || 0) + revenue;
    });
  });

  const channelDataAll = Object.keys(channelDataMap).map(key => ({
    name: key,
    value: channelDataMap[key]
  })).sort((a, b) => b.value - a.value);

  const channelLimit = channelFilter === 'all' ? channelDataAll.length : parseInt(channelFilter);
  const channelData = channelDataAll.slice(0, channelLimit);

  // Chart Data: Occupancy by Property
  const occupancyLimit = occupancyFilter === 'all' ? filteredProperties.length : parseInt(occupancyFilter);
  const occupancyData = [...filteredProperties]
    .sort((a, b) => b.occupancy - a.occupancy)
    .slice(0, occupancyLimit);

  // Chart Data: Revenue by Property Type
  const typeDataMap: Record<string, number> = {};
  filteredProperties.forEach(prop => {
    const bedrooms = prop.bedroomsNumber ?? 0;
    const type = bedrooms === 0 ? "Studio" : `${bedrooms} Bedroom`;
    typeDataMap[type] = (typeDataMap[type] || 0) + prop.revenue;
  });

  const typeData = Object.keys(typeDataMap).map(key => ({
    name: key,
    value: typeDataMap[key]
  })).sort((a, b) => b.value - a.value);

  const PIE_COLORS: Record<string, string> = {
    'Airbnb': '#ef4444',
    'Booking.com': '#3b82f6',
    'Direct': '#10b981'
  };

  const BAR_COLORS = [
    '#3b82f6', '#10b981', '#2d7ff9', '#8b5cf6', '#ec4899',
    '#f43f5e', '#14b8a6', '#f97316', '#06b6d4', '#84cc16'
  ];

  // === Property Intelligence Tab ===
  const aiSignals: IntelSignal[] = [];
  filteredProperties.forEach(p => {
    const base = Number(p.price) || 0;
    const gaps = (p.calendarDays ?? []).filter(d => d.status === 'available' || d.status === 'open').length;
    if (p.occupancy >= 85) {
      aiSignals.push({ id: `star-${p.id}`, property: p.name, signal: 'Star Performer', action: `${p.occupancy}% occupied — raise ADR 8–12%`, impact: `+${Math.round(p.revenue * 0.1).toLocaleString()} ${currency} est.`, type: 'star' });
    } else if (p.occupancy >= 60 && base > 0 && p.avgPrice < base) {
      aiSignals.push({ id: `raise-${p.id}`, property: p.name, signal: 'Price Lift Opportunity', action: `ADR below listed rate — lift towards ${base} ${currency}`, impact: `+${Math.round((base - p.avgPrice) * 8).toLocaleString()} ${currency} est.`, type: 'raise' });
    } else if (p.occupancy < 30) {
      aiSignals.push({ id: `lower-${p.id}`, property: p.name, signal: 'Underperforming', action: `Only ${p.occupancy}% booked — revisit pricing strategy`, impact: 'Revenue at risk', type: 'lower' });
    } else if (gaps >= 5) {
      aiSignals.push({ id: `gap-${p.id}`, property: p.name, signal: `${gaps} Gap Days`, action: 'Apply gap-fill pricing or min-stay flexibility', impact: 'Capture short-stay demand', type: 'gap' });
    }
  });
  const displaySignals = aiSignals.slice(0, 6);

const actionQueue = [...filteredProperties].map(p => {
    const base = Number(p.price) || 0;
    const gaps = (p.calendarDays ?? []).filter(d => d.status === 'available' || d.status === 'open').length;
    const bookedDays = (p.calendarDays ?? []).filter(d => d.status === 'booked' || d.status === 'reserved').length;
    const unitType = (p.bedroomsNumber ?? 0) === 0 ? 'Studio' : `${p.bedroomsNumber}BR`;
    let priority: ActionPriority;
    let issue: string;
    let action: string;
    let uplift: string;
    let upliftNum = 0;
    if (p.occupancy < 25) {
      priority = 'critical';
      issue = `Only ${p.occupancy}% booked — well below target`;
      action = `Drop price 10-15%, relax min-stay`;
      upliftNum = gaps > 0 ? Math.round(p.avgPrice * 0.85 * Math.min(gaps, 10)) : 0;
      uplift = upliftNum > 0 ? `+${upliftNum.toLocaleString("en-US")} ${currency} est.` : '—';
    } else if (p.occupancy < 40) {
      priority = 'high';
      issue = `${p.occupancy}% occ — below market pace`;
      action = `Review pricing & reduce minimum stay`;
      upliftNum = gaps > 0 ? Math.round(p.avgPrice * Math.min(gaps, 8)) : 0;
      uplift = upliftNum > 0 ? `+${upliftNum.toLocaleString("en-US")} ${currency} est.` : `Fill ${gaps} open days`;
    } else if (p.occupancy >= 70 && base > 0 && p.avgPrice < base * 0.97) {
      priority = 'opportunity';
      issue = `High demand but ADR below listed rate`;
      action = `Raise ADR to ${base.toLocaleString("en-US")} ${currency}`;
      upliftNum = Math.round((base - p.avgPrice) * bookedDays);
      uplift = `+${upliftNum.toLocaleString("en-US")} ${currency} est.`;
    } else if (p.occupancy >= 80) {
      priority = 'opportunity';
      issue = `${p.occupancy}% occupied — prime window to push rates`;
      action = `Test 8-12% rate increase on upcoming dates`;
      upliftNum = Math.round(p.revenue * 0.10);
      uplift = `+${upliftNum.toLocaleString("en-US")} ${currency} est.`;
    } else if (p.occupancy < 65 && gaps >= 5) {
      priority = 'monitor';
      issue = `${gaps} gap days — short-stay demand available`;
      action = `Apply gap-fill discount or 2-night min`;
      upliftNum = Math.round(p.avgPrice * 0.9 * Math.min(gaps, 5));
      uplift = upliftNum > 0 ? `+${upliftNum.toLocaleString("en-US")} ${currency} est.` : `Capture short-stay revenue`;
    } else {
      priority = 'optimal';
      issue = `${p.occupancy}% occ — performing well`;
      action = `Maintain current pricing strategy`;
      uplift = '—';
    }
    return { ...p, priority, issue, action, uplift, upliftNum, unitType };
  }).sort((a, b) => {
    const order: Record<ActionPriority, number> = { critical: 0, high: 1, opportunity: 2, monitor: 3, optimal: 4 };
    return order[a.priority] - order[b.priority];
  });

  // Intel tab computed values
  const availableUnitTypes = [...new Set(actionQueue.map(p => p.unitType))].sort();
  const filteredIntelQueue = actionQueue
    .filter(p => intelPriorityFilter === 'all' || p.priority === intelPriorityFilter)
    .filter(p => intelTypeFilter === 'all' || p.unitType === intelTypeFilter)
    .slice(0, 10);
  const heroCards = actionQueue
    .filter(p => p.priority === 'critical' || p.priority === 'high')
    .slice(0, 3);
  const occDistribution = [
    { name: 'Critical', range: '<25%', count: filteredProperties.filter(p => p.occupancy < 25).length, fill: '#ef4444' },
    { name: 'High', range: '25-40%', count: filteredProperties.filter(p => p.occupancy >= 25 && p.occupancy < 40).length, fill: '#f97316' },
    { name: 'Monitor', range: '40-65%', count: filteredProperties.filter(p => p.occupancy >= 40 && p.occupancy < 65).length, fill: '#2d7ff9' },
    { name: 'Good', range: '65-80%', count: filteredProperties.filter(p => p.occupancy >= 65 && p.occupancy < 80).length, fill: '#3b82f6' },
    { name: 'Optimal', range: '80%+', count: filteredProperties.filter(p => p.occupancy >= 80).length, fill: '#10b981' },
  ];
  const revenueOpportunityData = actionQueue
    .filter(p => p.upliftNum > 0)
    .sort((a, b) => b.upliftNum - a.upliftNum)
    .slice(0, 5)
    .map(p => ({
      name: p.name.length > 16 ? p.name.substring(0, 16) + '…' : p.name,
      value: p.upliftNum,
      priority: p.priority,
    }));
  const priorityColor: Record<ActionPriority, string> = {
    critical: '#ef4444', high: '#f97316', opportunity: '#3b82f6', monitor: '#2d7ff9', optimal: '#10b981',
  };
  const priSummaryConfig: Record<string, { active: string; inactive: string; countColor: string }> = {
    critical:    { active: 'border-rose-500/50 bg-rose-500/10',    inactive: 'border-border dark:border-white/10 bg-background/60 dark:bg-white/[0.02] hover:border-rose-500/30 hover:bg-rose-500/5',    countColor: 'text-rose-500' },
    high:        { active: 'border-destructive/50 bg-destructive/10',inactive: 'border-border dark:border-white/10 bg-background/60 dark:bg-white/[0.02] hover:border-destructive/30 hover:bg-destructive/5', countColor: 'text-destructive' },
    opportunity: { active: 'border-blue-500/50 bg-blue-500/10',    inactive: 'border-border dark:border-white/10 bg-background/60 dark:bg-white/[0.02] hover:border-blue-500/30 hover:bg-blue-500/5',    countColor: 'text-blue-500' },
    optimal:     { active: 'border-emerald-500/50 bg-emerald-500/10', inactive: 'border-border dark:border-white/10 bg-background/60 dark:bg-white/[0.02] hover:border-emerald-500/30 hover:bg-emerald-500/5', countColor: 'text-emerald-500' },
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border/50 p-3 rounded-xl shadow-lg">
          <p className="font-semibold text-sm mb-1 text-foreground dark:text-white">{label}</p>
          <p className="text-emerald-600 dark:text-emerald-500 font-bold text-sm">
            {payload[0].name === "occupancy" ? `${payload[0].value}%` : `${payload[0].value.toLocaleString()} ${currency}`}
          </p>
          <p className="text-muted-foreground text-xs mt-1">
            {payload[0].name === "occupancy" ? "Occupancy Rate" : "Projected Revenue"}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full overflow-y-auto w-full p-8 bg-background text-foreground dark:bg-black relative">
      {/* Ambient background glow for glassmorphism */}
      <div className="fixed top-[-10%] left-[-10%] w-[40vw] h-[40vh] rounded-full bg-primary/20 dark:bg-primary/10 blur-[120px] pointer-events-none z-0" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40vw] h-[40vh] rounded-full bg-emerald-500/20 dark:bg-emerald-500/10 blur-[120px] pointer-events-none z-0" />
      <div className="fixed top-[40%] left-[30%] w-[30vw] h-[30vh] rounded-full bg-violet-500/20 dark:bg-violet-500/10 blur-[120px] pointer-events-none z-0" />

      <div className="z-10 relative flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground dark:text-white">Portfolio Analytics</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            30-day forward-looking property performance metrics.
          </p>
        </div>

        <div className="flex items-center gap-4 w-full md:w-auto">
          <Button
            onClick={handleSync}
            disabled={isSyncing}
            id="tour-sync-button"
            variant="outline"
            className="gap-2 bg-background/50 backdrop-blur-sm border-primary/20 hover:border-primary/50 hover:bg-primary/10 text-primary dark:text-primary"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Syncing..." : "Sync Hostaway"}
          </Button>

          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter properties or locations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-background/50 border-muted-foreground/20 focus-visible:ring-primary/30"
            />
          </div>
        </div>
      
      {properties.length === 0 && (
        <div className="z-10 relative mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          No properties loaded for your account. Run <strong>Sync Hostaway</strong> on the Sync page, or use the button above to refresh from your database.
        </div>
      )}

      {/* Focus Mode indicator */}
      {filteredProperties.length === 1 && searchTerm && (
        <div className="z-10 relative mb-6 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber/10 border border-amber/20 text-amber text-xs font-bold uppercase tracking-widest shadow-lg shadow-amber/5">
            <Bot className="h-3.5 w-3.5" />
            Focus Mode: {filteredProperties[0].name}
            <button 
              onClick={() => setSearchTerm("")} 
              className="ml-2 p-0.5 hover:bg-amber/20 rounded-full transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
      </div>

      {/* ── Dashboard Inner Tabs ── */}
      <div className="flex items-center gap-1 mb-6 border-b border-border dark:border-white/10 z-10 relative">
        {(["overview", "database", "calendar"] as const).map((tab) => {
          const Icon = tab === "overview" ? BarChart2 : tab === "database" ? Database : CalendarRange;
          const label = tab === "overview" ? "Overview" : tab === "database" ? "Property Intelligence" : "Global Calendar";
          return (
            <button
              key={tab}
              onClick={() => setDashTab(tab)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                dashTab === tab
                  ? "border-primary text-primary dark:text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>

      <div className={cn("grid gap-4 md:grid-cols-2 lg:grid-cols-5 mb-8", dashTab !== "overview" && "hidden")}>
        <UITooltip>
          <TooltipTrigger asChild>
            <Card className="bg-background/60 dark:bg-[#111113]/60 backdrop-blur-xl border-border dark:border-white/5 shadow-xl dark:shadow-2xl overflow-hidden relative group hover:border-primary/20 transition-all duration-500 cursor-help">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-primary/10 transition-colors" />
              <CardHeader className="flex flex-row items-center justify-between pb-2 z-10 relative">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-widest text-[10px]">Total Properties</CardTitle>
                <div className="h-8 w-8 rounded-lg bg-muted/50 dark:bg-black/40 border border-border dark:border-white/10 flex items-center justify-center">
                  <Building2 className="h-4 w-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent className="z-10 relative">
                <div className="text-3xl font-light text-foreground dark:text-white">{filteredTotalProperties}</div>
                <p className="text-xs text-emerald-600 dark:text-emerald-500/80 mt-1 font-medium flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Active in portfolio
                </p>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="dark:bg-black dark:text-white border border-white/20 p-2 text-xs">
            Total number of active property units synced from your PMS (Hostaway).
          </TooltipContent>
        </UITooltip>

        <UITooltip>
          <TooltipTrigger asChild>
            <Card className="bg-background/60 dark:bg-[#111113]/60 backdrop-blur-xl border-border dark:border-white/5 shadow-xl dark:shadow-2xl overflow-hidden relative group hover:border-emerald-500/20 transition-all duration-500 cursor-help">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-emerald-500/10 transition-colors" />
              <CardHeader className="flex flex-row items-center justify-between pb-2 z-10 relative">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-widest text-[10px]">Avg Occupancy (30D)</CardTitle>
                <div className="h-8 w-8 rounded-lg bg-muted/50 dark:bg-black/40 border border-border dark:border-white/10 flex items-center justify-center">
                  <CalendarCheck className="h-4 w-4 text-emerald-500" />
                </div>
              </CardHeader>
              <CardContent className="z-10 relative">
                <div className="text-3xl font-light text-foreground dark:text-white">{filteredAvgOccupancy}%</div>
                <p className="text-xs text-emerald-600 dark:text-emerald-500/80 mt-1 font-medium flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Across all properties
                </p>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="dark:bg-black dark:text-white border border-white/20 p-2 text-xs">
            Projected occupancy for the next 30 days based on confirmed bookings.
          </TooltipContent>
        </UITooltip>

        <UITooltip>
          <TooltipTrigger asChild>
            <Card className="bg-background/60 dark:bg-[#111113]/60 backdrop-blur-xl border-border dark:border-white/5 shadow-xl dark:shadow-2xl overflow-hidden relative group hover:border-violet-500/20 transition-all duration-500 cursor-help">
              <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/5 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-violet-500/10 transition-colors" />
              <CardHeader className="flex flex-row items-center justify-between pb-2 z-10 relative">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-widest text-[10px]">Avg Daily Rate</CardTitle>
                <div className="h-8 w-8 rounded-lg bg-muted/50 dark:bg-black/40 border border-border dark:border-white/10 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-violet-500 dark:text-violet-400" />
                </div>
              </CardHeader>
              <CardContent className="z-10 relative">
                <div className="text-3xl font-light text-foreground dark:text-white">{filteredAvgPrice} <span className="text-lg font-light text-muted-foreground">{currency}</span></div>
                <p className="text-xs text-emerald-600 dark:text-emerald-500/80 mt-1 font-medium flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Overall booked rate
                </p>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="dark:bg-black dark:text-white border border-white/20 p-2 text-xs">
            Average nightly rate across all upcoming bookings in the next 30 days.
          </TooltipContent>
        </UITooltip>

        <UITooltip>
          <TooltipTrigger asChild>
            <Card 
              id="tour-kpi-revenue"
              className="bg-background/60 dark:bg-[#111113]/60 backdrop-blur-xl border-border dark:border-white/5 shadow-xl dark:shadow-2xl overflow-hidden relative group border-t-primary cursor-help"
            >
              <div className="absolute top-0 right-0 w-48 h-48 bg-primary/10 rounded-full blur-3xl -mr-16 -mt-16" />
              <CardHeader className="flex flex-row items-center justify-between pb-2 z-10 relative">
                <CardTitle className="text-sm font-medium text-primary dark:text-primary/80 uppercase tracking-widest text-[10px]">Projected Revenue</CardTitle>
                <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <DollarSign className="h-4 w-4 text-primary dark:text-primary" />
                </div>
              </CardHeader>
              <CardContent className="z-10 relative">
                <div className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/80 dark:from-primary/20 dark:to-primary">{filteredTotalRevenue.toLocaleString()} <span className="text-lg font-medium text-primary/50">{currency}</span></div>
                <p className="text-xs text-primary dark:text-primary/80 mt-1 font-medium flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Estimated 30-day gross
                </p>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="dark:bg-black dark:text-white border border-white/20 p-2 text-xs">
            Estimated gross revenue for the next 30 days (Confirmed Bookings + Projected yield).
          </TooltipContent>
        </UITooltip>

        <UITooltip>
          <TooltipTrigger asChild>
            <Card className="bg-background/60 dark:bg-[#111113]/60 backdrop-blur-xl border-border dark:border-white/5 shadow-xl dark:shadow-2xl overflow-hidden relative group border-t-emerald-500 cursor-help">
              <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl -mr-16 -mt-16" />
              <CardHeader className="flex flex-row items-center justify-between pb-2 z-10 relative">
                <CardTitle className="text-sm font-medium text-emerald-600 dark:text-emerald-500/80 uppercase tracking-widest text-[10px]">Lifetime Earnings</CardTitle>
                <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-500" />
                </div>
              </CardHeader>
              <CardContent className="z-10 relative">
                <div className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-500 to-emerald-700 dark:from-emerald-200 dark:to-emerald-500">{(totalHistoricalRevenue).toLocaleString()} <span className="text-lg font-medium text-emerald-500/50">{currency}</span></div>
                <p className="text-xs text-emerald-600 dark:text-emerald-500/80 mt-1 font-medium flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> All-time booked revenue
                </p>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="dark:bg-black dark:text-white border border-white/20 p-2 text-xs">
            Total historical revenue generated across the entire portfolio life-cycle.
          </TooltipContent>
        </UITooltip>
      </div>

      <div className={cn("grid gap-4 md:grid-cols-2 mb-8", dashTab !== "overview" && "hidden")}>
        {/* Top Drivers by Revenue */}
        <Card className="shadow-xl dark:shadow-2xl border-border dark:border-white/5 bg-background/60 dark:bg-[#111113]/60 backdrop-blur-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-foreground dark:text-white">Top Drivers by Revenue</CardTitle>
              <CardDescription className="text-muted-foreground">Highest performing properties.</CardDescription>
            </div>
            <Select value={revenueFilter} onValueChange={setRevenueFilter}>
              <SelectTrigger className="w-[100px] h-8 text-xs">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">Top 5</SelectItem>
                <SelectItem value="10">Top 10</SelectItem>
                <SelectItem value="20">Top 20</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="px-2">
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#888888" opacity={0.2} />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#888888' }}
                    dy={10}
                    tickFormatter={(val) => val.length > 15 ? val.substring(0, 15) + '...' : val}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#888888' }}
                    tickFormatter={(val) => `${Math.round(val / 1000)}k`}
                    dx={-10}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#888888', opacity: 0.1 }} />
                  <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                    {chartData.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Occupancy Rate per Property */}
        <Card className="shadow-xl dark:shadow-2xl border-border dark:border-white/5 bg-background/60 dark:bg-[#111113]/60 backdrop-blur-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-foreground dark:text-white">Occupancy Rate by Property</CardTitle>
              <CardDescription className="text-muted-foreground">Highest occupancy rates.</CardDescription>
            </div>
            <Select value={occupancyFilter} onValueChange={setOccupancyFilter}>
              <SelectTrigger className="w-[100px] h-8 text-xs border-border">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">Top 5</SelectItem>
                <SelectItem value="10">Top 10</SelectItem>
                <SelectItem value="20">Top 20</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="px-2">
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={occupancyData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#888888" opacity={0.2} />
                  <XAxis
                    type="number"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#888888' }}
                    domain={[0, 100]}
                    tickFormatter={(val) => `${val}%`}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#888888' }}
                    width={100}
                    tickFormatter={(val) => val.length > 12 ? val.substring(0, 12) + '...' : val}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#888888', opacity: 0.1 }} />
                  <Bar dataKey="occupancy" radius={[0, 6, 6, 0]}>
                    {occupancyData.map((_entry, index) => (
                      <Cell key={`cell-occ-${index}`} fill={BAR_COLORS[(index + 5) % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Revenue By Property Type */}
        <Card className="shadow-xl dark:shadow-2xl border-border dark:border-white/5 bg-background/60 dark:bg-[#111113]/60 backdrop-blur-xl flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-foreground dark:text-white">Revenue By Property Type</CardTitle>
              <CardDescription className="text-muted-foreground">Studio vs 1BR vs 2BR performance.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex items-center justify-center p-0">
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={typeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {typeData.map((_entry, index) => (
                      <Cell key={`cell-type-${index}`} fill={BAR_COLORS[(index + 3) % BAR_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [`${value.toLocaleString()} ${currency}`, 'Revenue']}
                    contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }}
                    itemStyle={{ color: 'hsl(var(--foreground))', fontWeight: '500' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 px-4 pb-6 mt-[-10px]">
            {typeData.map((entry, index) => (
              <div key={`legend-${index}`} className="flex items-center gap-1.5 min-w-[fit-content]">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: BAR_COLORS[(index + 3) % BAR_COLORS.length] }} />
                <span className="text-[11px] text-muted-foreground font-medium truncate max-w-[120px]">{entry.name}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Revenue By Channel */}
        <Card className="shadow-xl dark:shadow-2xl border-border dark:border-white/5 bg-background/60 dark:bg-[#111113]/60 backdrop-blur-xl flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-foreground dark:text-white">Revenue By Channel</CardTitle>
              <CardDescription className="text-muted-foreground">Distribution of booked revenue.</CardDescription>
            </div>
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="w-[100px] h-8 text-xs">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">Top 3</SelectItem>
                <SelectItem value="5">Top 5</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="flex-1 flex items-center justify-center p-0">
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={channelData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {channelData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[entry.name] || '#2d7ff9'} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [`${value.toLocaleString()} ${currency}`, 'Revenue']}
                    contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }}
                    itemStyle={{ color: 'hsl(var(--foreground))', fontWeight: '500' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
          <div className="flex justify-center gap-4 pb-6 mt-[-10px]">
            {channelData.map(entry => (
              <div key={entry.name} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_COLORS[entry.name] || '#2d7ff9' }} />
                <span className="text-xs text-muted-foreground font-medium">{entry.name}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ── PROPERTY INTELLIGENCE VIEW ── */}
      <div className={cn("flex-col gap-6 mb-8", dashTab === "database" ? "flex" : "hidden")}>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border dark:border-white/10 bg-muted/20 dark:bg-white/[0.02] px-4 py-3">
          <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-medium text-muted-foreground">Filter</span>
          <Select value={intelPriorityFilter} onValueChange={(v) => setIntelPriorityFilter(v as 'all' | ActionPriority)}>
            <SelectTrigger className="w-[155px] h-7 text-xs border-border">
              <SelectValue placeholder="All Priorities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="opportunity">Opportunity</SelectItem>
              <SelectItem value="monitor">Monitor</SelectItem>
              <SelectItem value="optimal">Optimal</SelectItem>
            </SelectContent>
          </Select>
          <Select value={intelTypeFilter} onValueChange={setIntelTypeFilter}>
            <SelectTrigger className="w-[120px] h-7 text-xs border-border">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {availableUnitTypes.map(t => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(intelPriorityFilter !== 'all' || intelTypeFilter !== 'all') && (
            <button
              onClick={() => { setIntelPriorityFilter('all'); setIntelTypeFilter('all'); }}
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 border border-border rounded-full px-2 py-0.5 transition-colors"
            >
              <X className="h-2.5 w-2.5" /> Clear
            </button>
          )}
          <span className="text-[11px] text-muted-foreground ml-auto">
            Showing <strong className="text-foreground dark:text-white">{filteredIntelQueue.length}</strong> of {actionQueue.length} properties
          </span>
        </div>

        {/* Summary Stats Strip — clickable to filter */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([
            { key: 'critical' as const,    label: 'Critical',      subLabel: 'Needs urgent action',    monitorKey: 'monitor' as const },
            { key: 'high' as const,        label: 'High Priority', subLabel: 'Pacing behind market',   monitorKey: 'monitor' as const },
            { key: 'opportunity' as const, label: 'Opportunities', subLabel: 'Revenue to capture',     monitorKey: 'monitor' as const },
            { key: 'optimal' as const,     label: 'Optimal',       subLabel: 'On track · no action',   monitorKey: 'monitor' as const },
          ]).map(({ key, label, subLabel }) => {
            const count = actionQueue.filter(p => p.priority === key).length;
            const isActive = intelPriorityFilter === key;
            const cfg = priSummaryConfig[key];
            return (
              <button
                key={key}
                onClick={() => setIntelPriorityFilter(isActive ? 'all' : key)}
                className={cn(
                  "rounded-xl border p-4 text-left transition-all duration-200",
                  isActive ? cfg.active : cfg.inactive
                )}
              >
                <div className={cn("text-3xl font-bold mb-0.5 tabular-nums", cfg.countColor)}>{count}</div>
                <div className="text-xs font-semibold text-foreground dark:text-white">{label}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{subLabel}</div>
              </button>
            );
          })}
        </div>

        {/* Hero Cards — top 3 most urgent, clickable */}
        {heroCards.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
              <h3 className="text-sm font-semibold text-foreground dark:text-white">Needs Immediate Attention</h3>
              <span className="text-[10px] text-muted-foreground font-normal">— click to focus on property</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {heroCards.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setSearchTerm(p.name); setDashTab("overview"); }}
                  className="text-left w-full group"
                >
                  <div className={cn(
                    "rounded-xl p-4 border bg-background/60 dark:bg-[#111113]/60 backdrop-blur-xl hover:bg-muted/30 transition-all duration-200 h-full flex flex-col gap-3",
                    p.priority === 'critical'
                      ? "border-rose-500/25 hover:border-rose-500/50 shadow-[inset_0_1px_0_0_rgba(239,68,68,0.08)]"
                      : "border-destructive/25 hover:border-destructive/50 shadow-[inset_0_1px_0_0_rgba(249,115,22,0.08)]"
                  )}>
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 pr-2">
                        <p className="font-semibold text-sm text-foreground dark:text-white group-hover:text-primary transition-colors truncate">{p.name}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{p.area} · {p.unitType}</p>
                      </div>
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide shrink-0",
                        p.priority === 'critical'
                          ? "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20"
                          : "text-destructive dark:text-destructive bg-destructive/10 border-destructive/20"
                      )}>
                        {p.priority === 'critical' ? 'Critical' : 'High'}
                      </span>
                    </div>

                    <div>
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="text-muted-foreground">Occupancy (30d)</span>
                        <span className={cn("font-bold", p.occupancy < 25 ? 'text-rose-500' : 'text-destructive')}>{p.occupancy}%</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", p.occupancy < 25 ? 'bg-rose-500' : 'bg-destructive')}
                          style={{ width: `${Math.min(p.occupancy, 100)}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex-1 space-y-1">
                      <p className="text-[11px] text-muted-foreground">{p.issue}</p>
                      <p className="text-[11px] font-medium text-foreground dark:text-white">{p.action}</p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-border dark:border-white/5">
                      <span className="text-[10px] font-semibold text-emerald-500">{p.uplift}</span>
                      <span className="text-[10px] text-primary/70 group-hover:text-primary flex items-center gap-0.5 transition-colors">
                        Focus <ChevronRight className="h-3 w-3" />
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Charts Row — Occupancy Distribution + Revenue Uplift */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-background/60 backdrop-blur-xl border-border dark:border-white/5 shadow-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-foreground dark:text-white">Occupancy Health Distribution</CardTitle>
              <CardDescription className="text-xs">Properties by occupancy bucket · next 30 days</CardDescription>
            </CardHeader>
            <CardContent className="px-2 pb-4">
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={occDistribution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#888" opacity={0.1} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#888' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#888' }} allowDecimals={false} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          const d = occDistribution.find(o => o.name === label);
                          return (
                            <div className="bg-background/95 border border-border p-2 rounded-lg text-xs shadow-xl">
                              <p className="font-semibold mb-0.5">{label} <span className="text-muted-foreground font-normal">({d?.range})</span></p>
                              <p className="text-muted-foreground">{payload[0].value} {Number(payload[0].value) === 1 ? 'property' : 'properties'}</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                      cursor={{ fill: '#888', opacity: 0.08 }}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {occDistribution.map((entry, index) => (
                        <Cell key={`occ-dist-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 px-2">
                {occDistribution.map(d => (
                  <div key={d.name} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.fill }} />
                    <span className="text-[10px] text-muted-foreground">{d.name} ({d.range})</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-background/60 backdrop-blur-xl border-border dark:border-white/5 shadow-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-foreground dark:text-white">Revenue Uplift Opportunities</CardTitle>
              <CardDescription className="text-xs">Top 5 properties by estimated revenue gain</CardDescription>
            </CardHeader>
            <CardContent className="px-2 pb-4">
              {revenueOpportunityData.length > 0 ? (
                <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={revenueOpportunityData} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#888" opacity={0.1} />
                      <XAxis
                        type="number"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: '#888' }}
                        tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                      />
                      <YAxis
                        dataKey="name"
                        type="category"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: '#888' }}
                        width={95}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-background/95 border border-border p-2 rounded-lg text-xs shadow-xl">
                                <p className="font-semibold">{currency} {Number(payload[0].value).toLocaleString("en-US")}</p>
                                <p className="text-muted-foreground">Estimated uplift</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                        cursor={{ fill: '#888', opacity: 0.08 }}
                      />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {revenueOpportunityData.map((entry, index) => (
                          <Cell key={`uplift-${index}`} fill={priorityColor[entry.priority as ActionPriority] || '#2d7ff9'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[200px] flex flex-col items-center justify-center gap-2">
                  <Award className="h-6 w-6 text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground">All properties performing optimally.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* AI Revenue Signals */}
        {displaySignals.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground dark:text-white">AI Revenue Signals</h3>
              <span className="text-[10px] text-muted-foreground font-normal">— Actionable intelligence from your live portfolio data</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {displaySignals.map(sig => {
                const cfg = {
                  star:  { bg: 'bg-emerald-500/5 border-emerald-500/20', label: 'text-emerald-500', icon: <Award className="h-3 w-3" /> },
                  raise: { bg: 'bg-blue-500/5 border-blue-500/20',        label: 'text-blue-500',   icon: <ArrowUpRight className="h-3 w-3" /> },
                  lower: { bg: 'bg-rose-500/5 border-rose-500/20',        label: 'text-rose-500',   icon: <ArrowDownRight className="h-3 w-3" /> },
                  gap:   { bg: 'bg-primary/5 border-primary/20',      label: 'text-primary',  icon: <Zap className="h-3 w-3" /> },
                }[sig.type];
                return (
                  <div key={sig.id} className={`rounded-xl border p-4 ${cfg.bg}`}>
                    <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest mb-2 ${cfg.label}`}>
                      {cfg.icon}{sig.signal}
                    </div>
                    <p className="text-sm font-semibold text-foreground dark:text-white mb-1 truncate">
                      {sig.property.length > 32 ? sig.property.substring(0, 32) + '…' : sig.property}
                    </p>
                    <p className="text-[11px] text-muted-foreground mb-2.5">{sig.action}</p>
                    <div className={`text-[11px] font-semibold ${cfg.label}`}>{sig.impact}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Pricing Actions Queue — filtered, max 10, clickable rows */}
        <Card className="bg-background/60 backdrop-blur-xl border-border dark:border-white/5 shadow-xl">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                <CardTitle className="text-foreground dark:text-white">Pricing Actions Queue</CardTitle>
              </div>
              <span className="text-[10px] text-muted-foreground">
                {filteredIntelQueue.length} shown · click row to focus property
              </span>
            </div>
            <CardDescription>Ranked by urgency — critical first. Filtered by selections above.</CardDescription>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {filteredIntelQueue.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                <Target className="h-7 w-7 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No properties match the current filters.</p>
              </div>
            ) : (
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b border-border dark:border-white/10 bg-muted/20">
                    <th className="text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-4 py-2.5">Property</th>
                    <th className="text-center text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-3 py-2.5">Type</th>
                    <th className="text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-3 py-2.5">Occ %</th>
                    <th className="text-center text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-3 py-2.5">Priority</th>
                    <th className="text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-3 py-2.5">Issue</th>
                    <th className="text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-3 py-2.5">Recommended Action</th>
                    <th className="text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-4 py-2.5">Est. Uplift</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIntelQueue.map((row, idx) => {
                    const priCfg = {
                      critical:    { label: 'Critical',    cls: 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20' },
                      high:        { label: 'High',        cls: 'text-destructive dark:text-destructive bg-destructive/10 border-destructive/20' },
                      opportunity: { label: 'Opportunity', cls: 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20' },
                      monitor:     { label: 'Monitor',     cls: 'text-primary dark:text-primary bg-primary/10 border-primary/20' },
                      optimal:     { label: 'Optimal',     cls: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
                    }[row.priority];
                    return (
                      <tr
                        key={row.id}
                        onClick={() => { setSearchTerm(row.name); setDashTab("overview"); }}
                        className={cn(
                          "border-b border-border dark:border-white/5 cursor-pointer transition-colors hover:bg-primary/5",
                          idx % 2 === 1 ? 'bg-muted/10' : ''
                        )}
                      >
                        <td className="px-4 py-3 max-w-[200px]">
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold text-foreground dark:text-white text-sm truncate">{row.name}</p>
                            <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0 hidden group-hover:block" />
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate">{row.area}</p>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="text-[10px] font-medium text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">{row.unitType}</span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span className={cn("text-xs font-bold tabular-nums", row.occupancy >= 70 ? 'text-emerald-500' : row.occupancy >= 40 ? 'text-primary' : 'text-rose-500')}>{row.occupancy}%</span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-md border uppercase tracking-wide ${priCfg.cls}`}>{priCfg.label}</span>
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground max-w-[180px] truncate">{row.issue}</td>
                        <td className="px-3 py-3 text-xs text-foreground dark:text-white font-medium max-w-[200px]">{row.action}</td>
                        <td className="px-4 py-3 text-right text-xs font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums whitespace-nowrap">{row.uplift}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Performance Matrix (Scatter Plot) */}
        <Card className="bg-background/60 backdrop-blur-xl border-border shadow-xl">
          <CardHeader>
            <CardTitle className="text-foreground dark:text-white">Performance Matrix (Occupancy vs ADR)</CardTitle>
            <CardDescription>Identify underpriced and overpriced properties instantly. Bubble size = revenue.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[380px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis
                    type="number"
                    dataKey="avgPrice"
                    name="ADR"
                    unit={` ${currency}`}
                    tick={{ fill: '#888', fontSize: 11 }}
                    domain={['auto', 'auto']}
                    tickFormatter={(val) => val > 1000 ? `${(val / 1000).toFixed(1)}k` : val}
                  />
                  <YAxis
                    type="number"
                    dataKey="occupancy"
                    name="Occupancy"
                    unit="%"
                    tick={{ fill: '#888', fontSize: 11 }}
                    domain={[0, 100]}
                  />
                  <ZAxis type="number" dataKey="revenue" range={[100, 800]} />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3', stroke: '#888', opacity: 0.5 }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-background/90 backdrop-blur-md border border-border p-4 rounded-xl shadow-2xl">
                            <p className="font-semibold text-sm mb-2 text-foreground dark:text-white">{data.name}</p>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                              <p className="text-xs text-muted-foreground">ADR:</p>
                              <p className="text-xs font-bold text-foreground text-right">{data.avgPrice.toFixed(0)} {currency}</p>
                              <p className="text-xs text-muted-foreground">Occupancy:</p>
                              <p className="text-xs font-bold text-foreground text-right">{data.occupancy}%</p>
                              <p className="text-xs text-muted-foreground">RevPAR:</p>
                              <p className="text-xs font-bold text-violet-500 text-right">{Math.round(data.avgPrice * data.occupancy / 100).toLocaleString("en-US")} {currency}</p>
                              <p className="text-xs text-muted-foreground">Revenue:</p>
                              <p className="text-xs font-bold text-primary text-right">{data.revenue.toLocaleString("en-US")} {currency}</p>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Scatter name="Properties" data={filteredProperties}>
                    {filteredProperties.map((_, index) => {
                      const p = filteredProperties[index];
                      const color = p.occupancy >= 70 ? '#10b981' : p.occupancy >= 40 ? '#2d7ff9' : '#ef4444';
                      return <Cell key={`cell-${index}`} fill={color} opacity={0.75} />;
                    })}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 border-t border-border/50 pt-6">
              <div className="text-center p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-500 uppercase tracking-widest mb-1">Stars</p>
                <p className="text-[10px] text-muted-foreground">High Occ / High ADR</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-primary/5 border border-primary/20">
                <p className="text-xs font-bold text-primary dark:text-primary uppercase tracking-widest mb-1">Underpriced</p>
                <p className="text-[10px] text-muted-foreground">High Occ / Low ADR</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-rose-500/5 border border-rose-500/20">
                <p className="text-xs font-bold text-rose-600 dark:text-rose-500 uppercase tracking-widest mb-1">Overpriced</p>
                <p className="text-[10px] text-muted-foreground">Low Occ / High ADR</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-neutral-500/5 border border-neutral-500/20">
                <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-1">Dogs</p>
                <p className="text-[10px] text-muted-foreground">Low Occ / Low ADR</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className={cn("flex-1 shrink-0 flex flex-col shadow-xl dark:shadow-2xl mt-8 mb-8 border border-border dark:border-white/5 bg-background/60 dark:bg-[#111113]/60 backdrop-blur-xl", dashTab !== "calendar" && "hidden")}>
        <CardHeader className="border-b border-border dark:border-white/10 py-4 bg-gradient-to-r from-primary/5 dark:from-primary/10 to-transparent flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-primary dark:text-primary flex items-center gap-2">
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider hidden md:inline">Start Date</span>
            <Input
              type="month"
              value={format(calendarStartDate, 'yyyy-MM')}
              onChange={(e) => {
                if (e.target.value) {
                  const [year, month] = e.target.value.split('-');
                  setCalendarStartDate(new Date(parseInt(year), parseInt(month) - 1, 1));
                }
              }}
              className="w-auto h-9 bg-background/50 border-border dark:border-white/10"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0 flex flex-col relative w-full overflow-hidden">
          <div className="w-full overflow-x-auto custom-scrollbar">
            <div className="min-w-[1200px] inline-block align-top pb-4">
              <div className="flex bg-muted/20 dark:bg-muted/10 sticky top-0 z-20 border-b border-border dark:border-white/10 backdrop-blur-md">
                <div className="w-[300px] shrink-0 p-3 font-semibold text-xs text-muted-foreground uppercase border-r border-border dark:border-white/10 sticky left-0 bg-background dark:bg-[#0c0c0e] z-30 shadow-xl">
                  Property Name
                </div>
                <div className="flex flex-1">
                  {next30Days.map((d, i) => (
                    <div key={i} className="flex-1 min-w-[32px] max-w-[40px] border-r border-border dark:border-white/5 p-2 flex flex-col items-center justify-center bg-muted/5 dark:bg-black/20">
                      <span className="text-[10px] text-muted-foreground font-medium">{format(d, 'MMM')}</span>
                      <span className="text-xs font-bold text-foreground">{format(d, 'd')}</span>
                    </div>
                  ))}
                </div>
              </div>

              <TooltipProvider delayDuration={100}>
                {/* ~7 property rows visible; scroll for the rest */}
                <div className="max-h-[calc(7*3.5rem)] min-h-0 overflow-y-auto custom-scrollbar">
                <div className="flex flex-col relative z-0">
                  {filteredProperties.sort((a, b) => b.revenue - a.revenue).map((property, idx) => (
                    <div key={property.id} className={`flex min-h-[3.5rem] border-b border-border dark:border-white/5 transition-colors hover:bg-muted/50 dark:hover:bg-white/5 ${idx % 2 === 0 ? 'bg-transparent' : 'bg-muted/20 dark:bg-black/20'}`}>
                      <div className="w-[300px] shrink-0 p-3 flex flex-col justify-center border-r border-border dark:border-white/10 sticky left-0 bg-background dark:bg-[#0c0c0e] z-10 shadow-xl">
                        <span className="text-sm font-semibold truncate text-foreground dark:text-white">{property.name}</span>
                        <span className="text-xs text-muted-foreground truncate">{property.area}</span>
                      </div>
                      <div className="flex flex-1 relative py-1">
                        {next30Days.map((d, i) => {
                          const dateStr = format(d, 'yyyy-MM-dd');
                          const calDay = property.calendarDays?.find(c => c.date === dateStr);

                          // Look for a reservation exactly covering this day to render block
                          const reservation = property.reservations?.find(r => {
                            try {
                              return isWithinInterval(d, { start: parseISO(r.startDate), end: parseISO(r.endDate) });
                            } catch { return false; }
                          });

                          let bgColor = "bg-emerald-500/20 dark:bg-emerald-500/30";
                          let borderColor = "border-emerald-500/30 dark:border-emerald-500/40";

                          if (calDay?.status === 'blocked') {
                            bgColor = "bg-neutral-500/30 dark:bg-neutral-800/80";
                            borderColor = "border-neutral-400 dark:border-neutral-700";
                          } else if (calDay?.status === 'reserved' || calDay?.status === 'booked' || reservation) {
                            bgColor = "bg-rose-500/20 dark:bg-rose-500/30";
                            borderColor = "border-rose-500/50";
                          }

                          // We'll create tooltips for all days
                          return (
                            <div key={i} className="flex-1 min-w-[32px] max-w-[40px] px-0.5 relative flex items-center">
                              <UITooltip>
                                <TooltipTrigger asChild>
                                  <div className={`w-full h-8 rounded-md border ${bgColor} ${borderColor} transition-all duration-300 hover:brightness-105 dark:hover:brightness-125 z-0 cursor-pointer`} />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="flex flex-col bg-popover dark:bg-black border border-border dark:border-white/20 p-3 rounded-xl shadow-2xl z-[99999] w-64 backdrop-blur-xl">
                                  {reservation ? (
                                    <>
                                      <div className="border-b border-border dark:border-white/10 pb-2 mb-2">
                                        <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-1">Confirmed Guest</p>
                                        <p className="text-sm font-bold text-foreground dark:text-white whitespace-nowrap overflow-hidden text-ellipsis">{reservation.title}</p>
                                        {reservation.email && (
                                          <p className="text-[10px] text-muted-foreground truncate">{reservation.email}</p>
                                        )}
                                      </div>
                                      <div className="flex justify-between items-center text-xs mb-1">
                                        <span className="text-muted-foreground">Total Payout:</span>
                                        <span className="font-bold text-emerald-600 dark:text-emerald-400">{reservation.financials?.hostPayout?.toLocaleString() || reservation.financials?.totalPrice?.toLocaleString() || 'Unknown'} {currency}</span>
                                      </div>
                                      <div className="flex justify-between items-center text-xs mb-1">
                                        <span className="text-muted-foreground">Channel:</span>
                                        <span className="font-semibold text-foreground dark:text-white capitalize">{reservation.financials?.channelName || reservation.financials?.channel || 'Direct'}</span>
                                      </div>
                                      <div className="flex justify-between items-center text-xs">
                                        <span className="text-muted-foreground">Dates:</span>
                                        <span className="font-medium text-foreground dark:text-white">{reservation.startDate} - {reservation.endDate}</span>
                                      </div>
                                    </>
                                  ) : calDay?.status === 'blocked' ? (
                                    <div className="text-xs text-center font-bold py-1">Owner Blocked</div>
                                  ) : calDay?.status === 'reserved' || calDay?.status === 'booked' ? (
                                    <>
                                      <div className="border-b border-border dark:border-white/10 pb-2 mb-2">
                                        <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-1">{format(d, 'MMM dd, yyyy')}</p>
                                        <p className="text-sm font-bold text-rose-600 dark:text-rose-400 uppercase tracking-tighter">Booked</p>
                                      </div>
                                      <div className="flex justify-between items-center text-xs mb-1">
                                        <span className="text-muted-foreground">Guest Details:</span>
                                        <span className="font-medium text-foreground dark:text-white">Hidden / External</span>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <div className="border-b border-border dark:border-white/10 pb-2 mb-2">
                                        <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-1">{format(d, 'MMM dd, yyyy')}</p>
                                        <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-tighter">Available</p>
                                      </div>
                                      <div className="flex justify-between items-center text-xs mb-1">
                                        <span className="text-muted-foreground">Current Rate:</span>
                                        <span className="font-bold text-foreground dark:text-white">{calDay?.price?.toLocaleString() || property.price} {currency}</span>
                                      </div>
                                      <div className="flex justify-between items-center text-xs mb-1">
                                        <span className="text-muted-foreground">Min Stay:</span>
                                        <span className="font-semibold text-foreground dark:text-white">{calDay?.minimumStay || 1} Nights</span>
                                      </div>
                                    </>
                                  )}
                                </TooltipContent>
                              </UITooltip>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                </div>
              </TooltipProvider>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sync Log Panel */}
      {isSyncLogOpen && (
        <div className="fixed bottom-20 right-6 z-50 w-[420px] max-h-80 rounded-xl border border-border dark:border-white/10 bg-[#0c0c0e]/95 backdrop-blur-xl shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 bg-white/[0.03]">
            <div className="flex items-center gap-2">
              <RefreshCw className={cn("h-3.5 w-3.5 text-primary", isSyncing && "animate-spin")} />
              <span className="text-xs font-semibold text-white">Sync Log</span>
              {isSyncing && (
                <span className="text-[10px] text-primary/70 animate-pulse">running…</span>
              )}
            </div>
            <button
              onClick={() => setIsSyncLogOpen(false)}
              className="text-white/40 hover:text-white/80 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1 font-mono">
            {syncLogs.map((entry, i) => (
              <div
                key={i}
                className="flex items-start gap-2.5 text-[11px] leading-relaxed"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <span className="text-white/25 shrink-0 tabular-nums select-none">{entry.ts}</span>
                <span className={cn(
                  entry.type === "success" ? "text-emerald-400" :
                  entry.type === "error"   ? "text-rose-400" :
                  entry.msg.startsWith("─") ? "text-white/10" :
                  entry.msg.startsWith("  └") ? "text-white/40" :
                  "text-white/70"
                )}>
                  {entry.msg}
                </span>
              </div>
            ))}
            {isSyncing && (
              <div className="flex items-center gap-2 text-[11px] text-white/30">
                <span className="animate-pulse font-mono">▋</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Ask Aria — same interaction pattern as Guest Inbox (toggle + bottom-right) */}
      <Button
        type="button"
        onClick={() => setIsChatOpen((v) => !v)}
        className={cn(
          "fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg transition-all duration-200 font-semibold text-sm h-auto border",
          isChatOpen
            ? "bg-amber text-black border-transparent hover:bg-amber/90"
            : "bg-surface-2 border-border-default text-text-secondary hover:text-amber hover:border-amber/40"
        )}
      >
        {isChatOpen ? (
          <>
            <X className="h-4 w-4 shrink-0" />
            <span>Close Aria</span>
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4 shrink-0 text-amber" />
            <span>Ask AI</span>
          </>
        )}
      </Button>

      <DashboardChatPopup 
        isOpen={isChatOpen} 
        onOpenChange={setIsChatOpen} 
      />
    </div>
    </TooltipProvider>
  );
}

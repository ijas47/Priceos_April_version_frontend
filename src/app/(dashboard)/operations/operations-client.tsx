"use client";

import { useState, useEffect, useMemo, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { DateRange } from "react-day-picker";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Wrench,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MessageCircle,
  RefreshCcw,
  ExternalLink,
  Calendar as CalendarIcon,
  X,
  User,
  Building2,
  Hash,
  ChevronDown,
  ChevronsUpDown,
  Bot,
  Tag,
  LayoutGrid,
  List,
  Flame,
  CheckCircle,
  Timer,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { backendFetch } from "@/lib/api/backend-client";

export function OperationsClient(props: { orgId: string }) {
  return (
    <Suspense fallback={<div>Loading operations...</div>}>
      <OperationsClientInternal {...props} />
    </Suspense>
  );
}

function OperationsClientInternal({ orgId }: { orgId: string }) {
  const searchParams = useSearchParams();
  const ticketIdParam = searchParams.get("ticketId");

  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [threadData, setThreadData] = useState<any | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);

  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved">("open");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);
  const [allProperties, setAllProperties] = useState<any[]>([]);

  const [viewType, setViewType] = useState<"table" | "cards">("table");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [sortColumn, setSortColumn] = useState<"severity" | "sla" | "reported" | "status" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const panelRef = useRef<HTMLDivElement>(null);

  const handleSort = (col: "severity" | "sla" | "reported" | "status") => {
    if (sortColumn === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(col);
      setSortDir("asc");
    }
  };

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Calculate metrics
  const metrics = useMemo(() => {
    const open = tickets.filter(t => t.status === "open");
    const resolved = tickets.filter(t => t.status === "resolved");
    
    // Simple logic for overdue: if current time > created time + SLA hours
    const overdue = open.filter(t => {
      const created = new Date(t.createdAt).getTime();
      const now = new Date().getTime();
      return (now - created) > (t.slaHours * 60 * 60 * 1000);
    });

    const avgSla = open.length > 0 
      ? Math.round(open.reduce((acc, t) => acc + (t.slaHours || 0), 0) / open.length) 
      : 0;

    return {
      openCount: open.length,
      resolvedCount: resolved.length,
      overdueCount: overdue.length,
      avgSla
    };
  }, [tickets]);

  useEffect(() => {
    backendFetch(`/listings/?orgId=${orgId}`)
      .then(data => {
        if (data.properties) setAllProperties(data.properties);
        else if (data.listings) setAllProperties(data.listings);
      })
      .catch(console.error);
  }, [orgId]);

  const uniqueProperties = useMemo(() => {
    if (allProperties.length > 0) {
      return allProperties.map(p => ({ id: p.id, name: p.name }));
    }
    const propsMap = new Map<string, string>();
    tickets.forEach(t => {
      if (t.listingId && t.listingName && t.listingName !== "Unknown Property") {
        propsMap.set(t.listingId, t.listingName);
      }
    });
    return Array.from(propsMap.entries()).map(([id, name]) => ({ id, name }));
  }, [tickets, allProperties]);

  const filteredTickets = useMemo(() => {
    let filtered = [...tickets];
    if (statusFilter !== "all") filtered = filtered.filter(t => t.status === statusFilter);
    if (propertyFilter !== "all") filtered = filtered.filter(t => String(t.listingId) === propertyFilter);
    if (dateRange?.from) {
      filtered = filtered.filter(t => {
        const tDate = new Date(new Date(t.createdAt).setHours(0, 0, 0, 0));
        const fromDate = new Date(dateRange.from!.setHours(0, 0, 0, 0));
        if (dateRange.to) {
          const toDate = new Date(dateRange.to.setHours(0, 0, 0, 0));
          return tDate >= fromDate && tDate <= toDate;
        }
        return tDate.getTime() === fromDate.getTime();
      });
    }
    if (sortColumn) {
      const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      const statusOrder: Record<string, number> = { open: 0, resolved: 1, closed: 2 };
      filtered.sort((a, b) => {
        let cmp = 0;
        if (sortColumn === "severity") cmp = (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9);
        else if (sortColumn === "sla") cmp = (a.slaHours ?? 0) - (b.slaHours ?? 0);
        else if (sortColumn === "reported") cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        else if (sortColumn === "status") cmp = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return filtered;
  }, [tickets, propertyFilter, dateRange, statusFilter, sortColumn, sortDir]);

  const fetchTickets = async (silent = false) => {
    if (!orgId) return;
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/guest-agent/tickets?orgId=${orgId}`);
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
      }
    } catch (err) {
      console.error("Failed to fetch tickets", err);
      toast.error("Failed to load operations tickets");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTickets();
    const interval = setInterval(() => fetchTickets(true), 30_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  // Handle deep linking
  useEffect(() => {
    if (ticketIdParam && tickets.length > 0) {
      const ticket = tickets.find(t => t.id === ticketIdParam || t._id === ticketIdParam);
      if (ticket) {
        handleRowClick(ticket);
        // Clear status filter if it would hide this ticket
        if (statusFilter !== "all" && ticket.status !== statusFilter) {
          setStatusFilter("all");
        }
        // Clear property filter if it would hide this ticket
        if (propertyFilter !== "all" && String(ticket.listingId) !== propertyFilter) {
          setPropertyFilter("all");
        }
      }
    }
  }, [ticketIdParam, tickets]);


  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchTickets(true);
  };

  const handleRowClick = async (ticket: any) => {
    setSelectedTicket(ticket);
    setThreadData(null);

    const tid: string = ticket.threadId || "";
    if (
      !tid ||
      tid === "N/A" ||
      tid.toLowerCase().includes("placeholder") ||
      tid.toLowerCase().includes("unknown")
    ) {
      setThreadData({ isManual: true });
      return;
    }

    setLoadingThread(true);
    try {
      // 1) Try GuestThread first (24-char MongoDB ObjectId)
      const isObjectId = /^[a-f0-9]{24}$/i.test(tid);
      if (isObjectId) {
        const res = await fetch(`/api/guest-agent/threads/${tid}`);
        if (res.ok) {
          const data = await res.json();
          setThreadData({ ...data, source: "guest_thread" });
          return;
        }
      }
      // 2) Fall back to Hostaway conversation (numeric / non-ObjectId IDs)
      const hwRes = await fetch(
        `/api/hostaway/conversation/${tid}?orgId=${orgId}`
      );
      if (hwRes.ok) {
        const hwData = await hwRes.json();
        setThreadData({ ...hwData, source: "hostaway" });
      } else {
        setThreadData({ error: true });
      }
    } catch {
      setThreadData({ error: true });
    } finally {
      setLoadingThread(false);
    }
  };

  const handleClosePanel = () => {
    setSelectedTicket(null);
    setThreadData(null);
  };

  const handleResolveTicket = async (ticketId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsUpdatingStatus(ticketId);
    try {
      const res = await fetch(`/api/guest-agent/tickets/${ticketId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "resolved", orgId }),
      });
      if (res.ok) {
        toast.success("Ticket marked as resolved");
        fetchTickets(true);
        // Update panel if it's showing this ticket
        if (selectedTicket?.id === ticketId || selectedTicket?._id === ticketId) {
          setSelectedTicket((prev: any) => ({ ...prev, status: "resolved" }));
        }
      } else {
        toast.error("Failed to update ticket status");
      }
    } catch {
      toast.error("Error updating ticket status");
    } finally {
      setIsUpdatingStatus(null);
    }
  };

  const getSeverityColor = (sev: string) => {
    switch (sev) {
      case "critical": return "bg-red-500/10 text-red-500 border-red-500/20";
      case "high": return "bg-destructive/10 text-destructive border-destructive/20";
      case "medium": return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      default: return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "resolved": return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "closed": return <XCircle className="w-4 h-4 text-text-tertiary" />;
      case "in_progress": return <Clock className="w-4 h-4 text-yellow-500 animate-pulse" />;
      default: return <AlertTriangle className="w-4 h-4 text-destructive" />;
    }
  };

  // Find the agent message that most likely triggered the ticket.
  // Handles both GuestThread shape (direction/createdAt) and Hostaway shape (sender/time).
  const findTriggerMessageIdx = (messages: any[], ticketCreatedAt: string): number => {
    if (!messages || messages.length === 0) return -1;
    const ticketTime = new Date(ticketCreatedAt).getTime();
    let closestIdx = -1;
    let closestDiff = Infinity;
    messages.forEach((msg, i) => {
      const isOutbound =
        msg.direction === "outbound" ||
        (msg.direction === undefined && msg.sender !== "guest");
      if (!isOutbound) return;
      const ts = msg.createdAt || msg.time;
      if (!ts) return;
      const msgTime = new Date(ts).getTime();
      const diff = Math.abs(ticketTime - msgTime);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestIdx = i;
      }
    });
    return closestIdx;
  };

  const propertyDisplayName = (ticket: any) => {
    if (ticket.listingName && ticket.listingName !== "Unknown Property") return ticket.listingName;
    const found = allProperties.find(p => String(p.id) === String(ticket.listingId));
    if (found) return found.name;
    return ticket.listingName || "-";
  };

  const isPanelOpen = !!selectedTicket;

  return (
    <div className="relative p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-2">
        <div className="animate-in fade-in slide-in-from-left-4 duration-1000">
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2.5 bg-blue-500/10 rounded-2xl border border-blue-500/20 shadow-inner">
              <Wrench className="w-6 h-6 text-blue-500" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-text-primary">Operations Tower</h1>
          </div>
          <p className="text-text-secondary text-sm">
            Real-time escalation tickets and maintenance tasks from Maya (Guest Agent).
          </p>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in slide-in-from-top-4 duration-1000 delay-200">
        <div className="bg-surface-1 border border-border-default rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group">
          <div className="flex justify-between items-start mb-3">
            <div className="p-2 bg-amber/10 rounded-xl group-hover:scale-110 transition-transform">
              <AlertTriangle className="w-5 h-5 text-amber" />
            </div>
            <Badge variant="outline" className="text-[10px] border-amber/20 text-amber bg-amber/5">Live</Badge>
          </div>
          <p className="text-text-muted text-xs font-medium uppercase tracking-wider mb-1">Active Tickets</p>
          <div className="flex items-end gap-2">
            <h3 className="text-3xl font-bold text-text-primary">{metrics.openCount}</h3>
            <span className="text-[10px] text-text-muted mb-1.5 font-medium">Unresolved items</span>
          </div>
        </div>

        <div className="bg-surface-1 border border-border-default rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group">
          <div className="flex justify-between items-start mb-3">
            <div className="p-2 bg-red-500/10 rounded-xl group-hover:scale-110 transition-transform">
              <Flame className="w-5 h-5 text-red-500" />
            </div>
            <Badge variant="outline" className="text-[10px] border-red-500/20 text-red-500 bg-red-500/5">Critical</Badge>
          </div>
          <p className="text-text-muted text-xs font-medium uppercase tracking-wider mb-1">SLA Overdue</p>
          <div className="flex items-end gap-2">
            <h3 className="text-3xl font-bold text-text-primary">{metrics.overdueCount}</h3>
            <span className="text-[10px] text-red-400 mb-1.5 font-medium">Requires action</span>
          </div>
        </div>

        <div className="bg-surface-1 border border-border-default rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group">
          <div className="flex justify-between items-start mb-3">
            <div className="p-2 bg-blue-500/10 rounded-xl group-hover:scale-110 transition-transform">
              <Timer className="w-5 h-5 text-blue-500" />
            </div>
          </div>
          <p className="text-text-muted text-xs font-medium uppercase tracking-wider mb-1">Average SLA</p>
          <div className="flex items-end gap-2">
            <h3 className="text-3xl font-bold text-text-primary">{metrics.avgSla}h</h3>
            <span className="text-[10px] text-text-muted mb-1.5 font-medium">Target response</span>
          </div>
        </div>

        <div className="bg-surface-1 border border-border-default rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group">
          <div className="flex justify-between items-start mb-3">
            <div className="p-2 bg-green-500/10 rounded-xl group-hover:scale-110 transition-transform">
              <CheckCircle className="w-5 h-5 text-green-500" />
            </div>
          </div>
          <p className="text-text-muted text-xs font-medium uppercase tracking-wider mb-1">Resolved</p>
          <div className="flex items-end gap-2">
            <h3 className="text-3xl font-bold text-text-primary">{metrics.resolvedCount}</h3>
            <span className="text-[10px] text-green-400 mb-1.5 font-medium">Lifetime total</span>
          </div>
        </div>
      </div>

      {/* Command Bar */}
      <div className="flex flex-col lg:flex-row justify-between items-center bg-surface-1/40 backdrop-blur-sm p-2 rounded-2xl border border-border-default shadow-sm gap-4">
        <div className="flex items-center gap-2 bg-surface-2/50 p-1 rounded-xl border border-border-subtle">
          <button
            onClick={() => setViewType("table")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all",
              viewType === "table" 
                ? "bg-surface-1 text-amber shadow-md border border-border-subtle" 
                : "text-text-tertiary hover:text-text-secondary"
            )}
          >
            <List className="w-3.5 h-3.5" />
            Table View
          </button>
          <button
            onClick={() => setViewType("cards")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all",
              viewType === "cards" 
                ? "bg-surface-1 text-amber shadow-md border border-border-subtle" 
                : "text-text-tertiary hover:text-text-secondary"
            )}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Card View
          </button>
        </div>

        <div className="flex items-center gap-3 flex-wrap lg:flex-nowrap">
          <div className="flex gap-1.5 bg-surface-2/50 p-1 rounded-xl border border-border-subtle">
            <button
              onClick={() => setStatusFilter(prev => prev === "open" ? "all" : "open")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-2",
                statusFilter === "open"
                  ? "bg-destructive/10 text-destructive border border-destructive/20"
                  : "text-text-tertiary hover:text-text-secondary"
              )}
            >
              <div className={cn("w-1.5 h-1.5 rounded-full", statusFilter === "open" ? "bg-destructive animate-pulse shadow-[0_0_8px_rgba(249,115,22,0.5)]" : "bg-text-tertiary/40")} />
              {tickets.filter(t => t.status === "open").length} Active
            </button>
            <button
              onClick={() => setStatusFilter(prev => prev === "resolved" ? "all" : "resolved")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-2",
                statusFilter === "resolved"
                  ? "bg-green-500/10 text-green-500 border border-green-500/20"
                  : "text-text-tertiary hover:text-text-secondary"
              )}
            >
              <div className={cn("w-1.5 h-1.5 rounded-full", statusFilter === "resolved" ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-text-tertiary/40")} />
              {tickets.filter(t => t.status === "resolved").length} Resolved
            </button>
          </div>

          <div className="h-6 w-px bg-border-subtle mx-1 hidden lg:block" />

          <div className="flex items-center gap-2">
            {(statusFilter !== "all" || propertyFilter !== "all" || dateRange?.from) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setStatusFilter("all"); setPropertyFilter("all"); setDateRange(undefined); }}
                className="h-9 text-[10px] uppercase font-bold text-text-tertiary hover:text-red-400 px-2 transition-colors"
              >
                Clear
              </Button>
            )}

            <Select value={propertyFilter} onValueChange={setPropertyFilter}>
              <SelectTrigger className="w-[160px] h-9 text-xs bg-surface-1 border-border-default shadow-sm">
                <SelectValue placeholder="All Properties" />
              </SelectTrigger>
              <SelectContent className="max-h-64 overflow-y-auto">
                <SelectItem value="all">All Properties</SelectItem>
                {uniqueProperties.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[220px] justify-start text-left font-normal h-9 text-xs bg-surface-1 border-border-default shadow-sm",
                    !dateRange && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-3.5 w-3.5 text-text-tertiary" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>{format(dateRange.from, "MMM dd")} - {format(dateRange.to, "MMM dd")}</>
                    ) : format(dateRange.from, "MMM dd")
                  ) : <span className="text-text-tertiary">Select Dates</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-surface-1 border-border-default shadow-2xl" align="end">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange?.from}
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-9 border-border-default bg-surface-1 text-text-primary hover:bg-surface-2 px-3 shadow-sm"
            >
              <RefreshCcw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
            </Button>
          </div>
        </div>
      </div>

      {/* Content View Switcher */}
      {viewType === "table" ? (
        <div className="bg-surface-1 rounded-2xl border border-border-default overflow-hidden shadow-xl">
          <Table>
            <TableHeader className="bg-surface-2/50">
              <TableRow className="hover:bg-transparent border-border-subtle">
                <TableHead className="text-text-secondary font-semibold py-4 w-[40%] min-w-[280px]">Issue</TableHead>
                <TableHead className="text-text-secondary font-semibold w-[18%] min-w-[140px]">Property</TableHead>
                <TableHead className="text-text-secondary font-semibold text-center w-[10%] min-w-[90px]">
                  <button onClick={() => handleSort("severity")} className="flex items-center gap-1 mx-auto hover:text-amber transition-colors group">
                    Severity <ChevronsUpDown className={cn("w-3 h-3 transition-colors", sortColumn === "severity" ? "text-amber" : "text-text-tertiary group-hover:text-amber")} />
                  </button>
                </TableHead>
                <TableHead className="text-text-secondary font-semibold w-[8%] min-w-[64px]">
                  <button onClick={() => handleSort("sla")} className="flex items-center gap-1 hover:text-amber transition-colors group">
                    SLA <ChevronsUpDown className={cn("w-3 h-3 transition-colors", sortColumn === "sla" ? "text-amber" : "text-text-tertiary group-hover:text-amber")} />
                  </button>
                </TableHead>
                <TableHead className="text-text-secondary font-semibold w-[12%] min-w-[110px]">
                  <button onClick={() => handleSort("reported")} className="flex items-center gap-1 hover:text-amber transition-colors group">
                    Reported <ChevronsUpDown className={cn("w-3 h-3 transition-colors", sortColumn === "reported" ? "text-amber" : "text-text-tertiary group-hover:text-amber")} />
                  </button>
                </TableHead>
                <TableHead className="text-text-secondary font-semibold w-[10%] min-w-[100px]">
                  <button onClick={() => handleSort("status")} className="flex items-center gap-1 hover:text-amber transition-colors group">
                    Status <ChevronsUpDown className={cn("w-3 h-3 transition-colors", sortColumn === "status" ? "text-amber" : "text-text-tertiary group-hover:text-amber")} />
                  </button>
                </TableHead>
                <TableHead className="text-text-secondary font-semibold text-right pr-6 w-[12%] min-w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <RefreshCcw className="w-8 h-8 text-text-tertiary animate-spin" />
                      <p className="text-text-tertiary font-medium">Scanning for operational exceptions...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredTickets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center">
                    <div className="flex flex-col items-center gap-3 opacity-60">
                      <CheckCircle2 className="w-12 h-12 text-green-500/50" />
                      <p className="text-text-tertiary font-medium text-lg">No tickets found.</p>
                      <p className="text-text-tertiary text-sm">Try adjusting your filters or enjoy the peace.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredTickets.map((ticket) => {
                  const ticketId = ticket.id || ticket._id;
                  const isExpanded = expandedRows.has(ticketId);
                  return (
                  <TableRow
                    key={ticketId}
                    onClick={() => handleRowClick(ticket)}
                    className={cn(
                      "hover:bg-surface-2/40 border-border-subtle transition-colors group cursor-pointer",
                      selectedTicket?.id === ticket.id && "bg-surface-2/60 ring-1 ring-inset ring-amber/20"
                    )}
                  >
                    {/* Issue */}
                    <TableCell className="py-4 pr-4">
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "w-1 rounded-full shrink-0 mt-1",
                          isExpanded ? "self-stretch min-h-[2.5rem]" : "h-10",
                          ticket.severity === "critical" ? "bg-red-500" :
                          ticket.severity === "high" ? "bg-destructive" :
                          ticket.severity === "medium" ? "bg-yellow-500" : "bg-blue-500"
                        )} />
                        <div className="flex flex-col min-w-0 flex-1">
                          <div className="flex items-start gap-2 mb-1">
                            <span className={cn(
                              "text-text-primary font-semibold text-sm leading-snug group-hover:text-amber transition-colors flex-1",
                              !isExpanded && "line-clamp-1"
                            )}>
                              {ticket.description}
                            </span>
                            <button
                              onClick={(e) => toggleExpand(ticketId, e)}
                              title={isExpanded ? "Collapse" : "Expand full text"}
                              className="shrink-0 p-0.5 rounded text-text-tertiary hover:text-text-primary hover:bg-surface-2 transition-colors mt-0.5"
                            >
                              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", isExpanded && "rotate-180")} />
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="capitalize text-[9px] h-4 px-1.5 font-bold tracking-tight border-border-strong text-text-tertiary bg-surface-2 shrink-0">
                              {ticket.category.replace('_', ' ')}
                            </Badge>
                            <span className="font-mono text-[10px] text-text-tertiary bg-surface-2 px-1.5 py-0.5 rounded border border-border-subtle uppercase">
                              RES-{(ticket.reservationId || "N/A").slice(-6)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </TableCell>

                    {/* Property */}
                    <TableCell className="py-4 pr-4">
                      <div className="flex items-start gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-text-tertiary shrink-0 mt-0.5" />
                        <span className={cn(
                          "text-sm font-medium",
                          !isExpanded && "truncate max-w-[160px]",
                          (propertyDisplayName(ticket) === "Unknown Property" || propertyDisplayName(ticket) === "-")
                            ? "text-text-tertiary italic"
                            : "text-text-secondary"
                        )}>
                          {propertyDisplayName(ticket)}
                        </span>
                      </div>
                    </TableCell>

                    {/* Severity */}
                    <TableCell className="text-center py-4 pr-4">
                      <Badge className={cn("px-2.5 py-0.5 border text-[10px] uppercase font-bold", getSeverityColor(ticket.severity))}>
                        {ticket.severity}
                      </Badge>
                    </TableCell>

                    {/* SLA */}
                    <TableCell className="py-4 pr-4">
                      <div className="flex items-center gap-1.5 font-medium text-sm text-text-secondary">
                        <Clock className="w-3.5 h-3.5 text-text-tertiary" />
                        {ticket.slaHours}h
                      </div>
                    </TableCell>

                    {/* Reported */}
                    <TableCell className="text-text-tertiary text-xs py-4 pr-4">
                      <div className="flex flex-col">
                        <span>{format(new Date(ticket.createdAt.endsWith('Z') ? ticket.createdAt : ticket.createdAt + 'Z'), "MMM d, yyyy")}</span>
                        <span className="text-[10px] opacity-70">{format(new Date(ticket.createdAt.endsWith('Z') ? ticket.createdAt : ticket.createdAt + 'Z'), "h:mm a")}</span>
                      </div>
                    </TableCell>

                    {/* Status */}
                    <TableCell className="py-4 pr-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-text-primary capitalize">
                        {getStatusIcon(ticket.status)}
                        {ticket.status === "open" ? "Active" : ticket.status.replace("_", " ")}
                      </div>
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right pr-6 py-4">
                      {ticket.status !== "resolved" && ticket.status !== "closed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => handleResolveTicket(ticket.id || ticket._id, e)}
                          disabled={isUpdatingStatus === (ticket.id || ticket._id)}
                          className="h-8 text-xs bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-500/20 shadow-sm"
                        >
                          {isUpdatingStatus === (ticket.id || ticket._id) ? (
                            <RefreshCcw className="w-3 h-3 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3 h-3 mr-1.5" />
                          )}
                          {!isUpdatingStatus && "Resolve"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        /* Card View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-in fade-in zoom-in-95 duration-500">
          {loading ? (
             Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-48 bg-surface-1 border border-border-default rounded-2xl animate-pulse" />
            ))
          ) : filteredTickets.length === 0 ? (
            <div className="col-span-full h-64 flex flex-col items-center justify-center bg-surface-1 rounded-2xl border border-dashed border-border-default text-text-tertiary">
              <CheckCircle2 className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-lg font-medium">All clear! No tickets found.</p>
            </div>
          ) : (
            filteredTickets.map((ticket) => {
              const ticketId = ticket.id || ticket._id;
              const isExpanded = expandedRows.has(ticketId);
              return (
              <div
                key={ticketId}
                onClick={() => handleRowClick(ticket)}
                className={cn(
                  "flex flex-col bg-surface-1 border border-border-default rounded-2xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer group relative overflow-hidden",
                  selectedTicket?.id === ticket.id && "ring-2 ring-amber/50 border-amber/20 shadow-amber/10 shadow-lg"
                )}
              >
                {/* Severity Bar */}
                <div className={cn(
                  "absolute top-0 left-0 bottom-0 w-1.5",
                  ticket.severity === "critical" ? "bg-red-500" :
                  ticket.severity === "high" ? "bg-destructive" :
                  ticket.severity === "medium" ? "bg-yellow-500" : "bg-blue-500"
                )} />
                <div className="flex justify-between items-start mb-3 pl-1.5">
                  <Badge variant="outline" className="capitalize text-[10px] font-bold tracking-tight bg-surface-2">
                    {ticket.category}
                  </Badge>
                  <Badge className={cn("px-2 py-0.5 border text-[9px] uppercase font-bold shadow-sm", getSeverityColor(ticket.severity))}>
                    {ticket.severity}
                  </Badge>
                </div>
                <div className="mb-3 pl-1.5">
                  <div className="flex items-start gap-1.5">
                    <h3 className={cn(
                      "text-sm font-semibold text-text-primary group-hover:text-amber transition-colors flex-1",
                      !isExpanded && "line-clamp-2"
                    )}>
                      {ticket.description}
                    </h3>
                    <button
                      onClick={(e) => toggleExpand(ticketId, e)}
                      title={isExpanded ? "Collapse" : "Expand full text"}
                      className="shrink-0 p-0.5 rounded text-text-tertiary hover:text-text-primary hover:bg-surface-2 transition-colors mt-0.5"
                    >
                      <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", isExpanded && "rotate-180")} />
                    </button>
                  </div>
                </div>
                <div className="mt-auto space-y-2.5 pl-1.5">
                  <div className="flex items-center gap-2 text-xs text-text-secondary">
                    <Building2 className="w-3.5 h-3.5 text-text-tertiary" />
                    <span className="truncate">{propertyDisplayName(ticket)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-[10px] text-text-tertiary">
                        <Clock className="w-3 h-3" />
                        {ticket.slaHours}h
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-text-tertiary">
                        <CalendarIcon className="w-3 h-3" />
                        {format(new Date(ticket.createdAt), "MMM d")}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                       {getStatusIcon(ticket.status)}
                       <span className="text-[10px] font-bold text-text-tertiary uppercase">{ticket.status === "open" ? "Active" : ticket.status.replace("_", " ")}</span>
                    </div>
                  </div>
                  {ticket.status === "open" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => handleResolveTicket(ticket.id || ticket._id, e)}
                      disabled={isUpdatingStatus === (ticket.id || ticket._id)}
                      className="w-full h-8 text-xs bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-500/20 mt-2"
                    >
                      <CheckCircle2 className="w-3 h-3 mr-1.5" />
                      Resolve Task
                    </Button>
                  )}
                </div>
              </div>
              );
            })
          )}
        </div>
      )}

      {/* Backdrop */}
      {isPanelOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]"
          onClick={handleClosePanel}
        />
      )}

      {/* Right Detail Panel */}
      <div
        ref={panelRef}
        className={cn(
          "fixed inset-y-0 right-0 z-50 w-[520px] max-w-[95vw] bg-surface-1 border-l border-border-default shadow-2xl flex flex-col transition-transform duration-300 ease-in-out",
          isPanelOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {selectedTicket && (
          <>
            {/* Panel Header */}
            <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-border-subtle bg-surface-2/50">
              <div className="flex items-start gap-3 min-w-0">
                <div className="p-2 bg-blue-500/10 rounded-lg mt-0.5 shrink-0">
                  <Wrench className="w-4 h-4 text-blue-500" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge className={cn("text-[9px] uppercase font-bold border px-2", getSeverityColor(selectedTicket.severity))}>
                      {selectedTicket.severity}
                    </Badge>
                    <Badge variant="outline" className="capitalize text-[9px] px-1.5 font-bold border-border-strong text-text-tertiary bg-surface-2">
                      {selectedTicket.category}
                    </Badge>
                  </div>
                  <p className="text-sm font-semibold text-text-primary leading-snug">
                    {selectedTicket.description}
                  </p>
                  <p className="text-xs text-text-tertiary mt-1">
                    Created {format(new Date(selectedTicket.createdAt.endsWith('Z') ? selectedTicket.createdAt : selectedTicket.createdAt + 'Z'), "MMM d, yyyy · h:mm a")}
                  </p>
                </div>
              </div>
              <button
                onClick={handleClosePanel}
                className="p-1.5 rounded-lg hover:bg-surface-2 text-text-tertiary hover:text-text-primary transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <ScrollArea className="flex-1">
              <div className="px-6 py-5 space-y-5">

                {/* Property & Reservation Info */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-surface-2/60 rounded-xl p-3.5 border border-border-subtle">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Building2 className="w-3.5 h-3.5 text-text-tertiary" />
                      <span className="text-[10px] font-black uppercase tracking-wider text-text-tertiary">Property</span>
                    </div>
                    <p className="text-sm font-semibold text-text-primary">
                      {propertyDisplayName(selectedTicket)}
                    </p>
                    {selectedTicket.listingId && (
                      <p className="text-[10px] text-text-tertiary font-mono mt-0.5 truncate">
                        ID: {selectedTicket.listingId}
                      </p>
                    )}
                  </div>

                  <div className="bg-surface-2/60 rounded-xl p-3.5 border border-border-subtle">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Hash className="w-3.5 h-3.5 text-text-tertiary" />
                      <span className="text-[10px] font-black uppercase tracking-wider text-text-tertiary">Reservation</span>
                    </div>
                    <p className="text-sm font-semibold text-text-primary font-mono">
                      {selectedTicket.reservationId
                        ? `RES-${selectedTicket.reservationId.slice(-6).toUpperCase()}`
                        : "N/A"}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Clock className="w-3 h-3 text-text-tertiary" />
                      <span className="text-[10px] text-text-tertiary">SLA: {selectedTicket.slaHours}h</span>
                    </div>
                  </div>
                </div>

                {/* Guest Info (from thread - GuestThread or Hostaway) */}
                {!loadingThread && threadData && !threadData.isManual && !threadData.error && (threadData.reservation || threadData.guestName) && (
                  <div className="bg-surface-2/60 rounded-xl p-3.5 border border-border-subtle">
                    <div className="flex items-center gap-1.5 mb-3">
                      <User className="w-3.5 h-3.5 text-text-tertiary" />
                      <span className="text-[10px] font-black uppercase tracking-wider text-text-tertiary">Guest Information</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-[10px] text-text-tertiary mb-0.5">Guest Name</p>
                        <p className="text-sm font-semibold text-text-primary">
                          {threadData.guestName || threadData.reservation?.guestName || "-"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-text-tertiary mb-0.5">Reservation ID</p>
                        <p className="text-xs font-mono text-text-primary">
                          {threadData.reservation?.reservationId || selectedTicket.reservationId || "-"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-text-tertiary mb-0.5">Status</p>
                        <Badge variant="outline" className="text-[9px] uppercase font-bold">
                          {threadData.reservation?.status || (threadData.source === "hostaway" ? "hostaway" : "-")}
                        </Badge>
                      </div>
                    </div>
                  </div>
                )}

                {/* Status + Actions */}
                <div className="flex items-center justify-between bg-surface-2/60 rounded-xl px-4 py-3 border border-border-subtle">
                  <div className="flex items-center gap-2 text-sm font-semibold text-text-primary capitalize">
                    {getStatusIcon(selectedTicket.status)}
                    {selectedTicket.status.replace("_", " ")}
                  </div>
                  {selectedTicket.status !== "resolved" && selectedTicket.status !== "closed" && (
                    <Button
                      size="sm"
                      onClick={(e) => handleResolveTicket(selectedTicket.id || selectedTicket._id, e)}
                      disabled={isUpdatingStatus === (selectedTicket.id || selectedTicket._id)}
                      className="h-8 text-xs bg-green-500/10 text-green-600 hover:bg-green-500/20 border border-green-500/20"
                      variant="outline"
                    >
                      {isUpdatingStatus === (selectedTicket.id || selectedTicket._id) ? (
                        <RefreshCcw className="w-3 h-3 mr-1.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3 h-3 mr-1.5" />
                      )}
                      Mark Resolved
                    </Button>
                  )}
                </div>

                {/* Conversation Thread */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <MessageCircle className="w-4 h-4 text-text-tertiary" />
                    <span className="text-[11px] font-black uppercase tracking-wider text-text-tertiary">Conversation</span>
                  </div>

                  {loadingThread ? (
                    <div className="flex justify-center items-center py-10 bg-surface-2/30 rounded-xl border border-border-subtle">
                      <RefreshCcw className="w-5 h-5 text-text-tertiary animate-spin" />
                    </div>
                  ) : threadData?.isManual ? (
                    <div className="py-8 text-center flex flex-col items-center bg-surface-2/30 rounded-xl border border-border-subtle border-dashed">
                      <Wrench className="w-6 h-6 text-text-tertiary mb-2" />
                      <p className="text-sm font-medium text-text-primary">Internal Operations Ticket</p>
                      <p className="text-xs text-text-tertiary max-w-[260px] mt-1">
                        Created by Maya or manually - not linked to an external guest thread.
                      </p>
                    </div>
                  ) : threadData?.error ? (
                    <div className="py-8 text-center text-text-tertiary bg-surface-2/30 rounded-xl border border-border-subtle border-dashed">
                      <p className="text-sm">Could not load thread details.</p>
                    </div>
                  ) : threadData?.messages ? (
                    <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1 scrollbar-thin">
                      {(() => {
                        const triggerIdx = findTriggerMessageIdx(threadData.messages, selectedTicket.createdAt);
                        const guestName =
                          threadData.guestName ||
                          threadData.reservation?.guestName ||
                          "Guest";
                        return threadData.messages.map((msg: any, idx: number) => {
                          // Normalise: support GuestThread (direction/content/createdAt)
                          // and Hostaway (sender/text/time) shapes
                          const isInbound =
                            msg.direction === "inbound" ||
                            (msg.direction === undefined && msg.sender === "guest");
                          const isTrigger = idx === triggerIdx;
                          const body = msg.content ?? msg.text ?? "";
                          const ts = msg.createdAt || msg.time || "";
                          let timeLabel = "";
                          try {
                            if (ts) {
                              const d = new Date(ts.endsWith("Z") ? ts : ts + "Z");
                              timeLabel = format(d, "h:mm a");
                            }
                          } catch { /* ignore bad timestamps */ }
                          return (
                            <div
                              key={idx}
                              className={cn(
                                "flex flex-col rounded-xl p-3 text-sm transition-all",
                                isInbound
                                  ? "bg-surface-2 border border-border-subtle"
                                  : isTrigger
                                  ? "bg-amber/5 border-2 border-amber/30 ml-6"
                                  : "bg-blue-500/5 border border-blue-500/15 ml-6"
                              )}
                            >
                              {/* Trigger badge */}
                              {isTrigger && (
                                <div className="flex items-center gap-1.5 mb-1.5">
                                  <Tag className="w-3 h-3 text-amber" />
                                  <span className="text-[9px] font-black uppercase tracking-widest text-amber">
                                    AI Ticket Created Here
                                  </span>
                                  <Bot className="w-3 h-3 text-amber" />
                                </div>
                              )}
                              <div className="flex items-center justify-between gap-4 mb-1">
                                <span className="text-[10px] font-bold uppercase opacity-60">
                                  {isInbound ? guestName : "Maya (Agent)"}
                                </span>
                                {timeLabel && (
                                  <span className="text-[10px] opacity-50 tabular-nums">{timeLabel}</span>
                                )}
                              </div>
                              <p className="whitespace-pre-wrap text-text-primary text-xs leading-relaxed">
                                {body}
                              </p>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-text-tertiary bg-surface-2/30 rounded-xl border border-border-subtle border-dashed">
                      <p className="text-sm">No conversation data available.</p>
                    </div>
                  )}
                </div>

                {/* View Thread external link */}
                {selectedTicket.threadId &&
                  selectedTicket.threadId !== "N/A" &&
                  !selectedTicket.threadId.includes("placeholder") && (
                    <div className="pb-2">
                      <a
                        href="#"
                        onClick={(e) => { e.preventDefault(); }}
                        className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Thread ID: {selectedTicket.threadId}
                      </a>
                    </div>
                  )}
              </div>
            </ScrollArea>
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getOrgId } from "@/lib/auth/client";
import {
  LayoutDashboard,
  TrendingUp,
  Globe,
  MessageSquare,
  Settings,
  LogOut,
  Users,
  MessagesSquare,
  Home,
  Bell,
  CalendarDays,
  Layers,
  AlertTriangle,
  Clock3,
  X,
  BarChart2,
  FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const BUSINESS_GROUP = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Pricing", href: "/pricing", icon: TrendingUp },
  { name: "Market", href: "/market", icon: Globe },
  { name: "Agent Chat", href: "/agent-chat", icon: MessagesSquare },
  { name: "Guest Inbox", href: "/guest-chat", icon: MessageSquare, showGuestBadge: true },
  { name: "Operations", href: "/operations", icon: Clock3 },
  { name: "Properties", href: "/properties", icon: Home },
  { name: "Groups", href: "/groups", icon: Layers },
  { name: "Analytics", href: "/analytics", icon: BarChart2 },
  { name: "Backtest", href: "/backtest", icon: FlaskConical },
];

export function AppSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [needsReplyCount, setNeedsReplyCount] = useState(0);
  const [pendingGuestTarget, setPendingGuestTarget] = useState<{ propertyId: string; conversationId: string } | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [todayEvents, setTodayEvents] = useState<
    { id: string; name: string; impactLevel: "high" | "medium" | "low"; upliftPct: number; area?: string; source?: string }[]
  >([]);
  const [proposalNotifications, setProposalNotifications] = useState<
    { id: string; label: string; listingName: string; type: "expiring" | "high_risk"; updatedAt?: string }[]
  >([]);
  const [guestNotifications, setGuestNotifications] = useState<
    { id: string; guestName: string; preview: string; propertyId: string; conversationId: string }[]
  >([]);
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<Set<string>>(new Set());


  // Refresh badges every minute so sidebar notifications stay current.
  useEffect(() => {
    let disposed = false;

    const refreshGuestInbox = async () => {
      try {
        const orgId = getOrgId();
        if (!orgId) return;
        const r = await fetch(`/api/hostaway/conversations/cached?orgId=${orgId}`);
        if (!r.ok) return;
        const data = await r.json();
        if (disposed || !data) return;
        const pendingConversations = (data.conversations ?? []).filter(
          (c: any) => c.unread || c.needsReply || c.status === "needs_reply"
        );
        const count = pendingConversations.length;
        setNeedsReplyCount(count);
        setGuestNotifications(
          pendingConversations
            .filter((c: any) => c.listingId && c.id)
            .slice(0, 8)
            .map((c: any) => ({
              id: `guest-${c.id}`,
              guestName: c.guestName || "Guest",
              preview: c.lastMessage || "New guest message",
              propertyId: String(c.listingId),
              conversationId: String(c.id),
            }))
        );
        const firstPending = pendingConversations.find((c: any) => c.listingId && c.id);
        setPendingGuestTarget(
          firstPending
            ? { propertyId: String(firstPending.listingId), conversationId: String(firstPending.id) }
            : null
        );
      } catch {
        // Best-effort only.
      }
    };

    const refreshTodayEvents = async () => {
      try {
        const orgId = getOrgId();
        if (!orgId) return;
        const today = new Date().toISOString().slice(0, 10);
        const r = await fetch(`/api/events?orgId=${orgId}&dateFrom=${today}&dateTo=${today}`);
        if (!r.ok) return;
        const data = await r.json();
        if (disposed || !data?.events) return;
        const items = (data.events as any[])
          .filter((e) => e?.isActive !== false)
          .map((e) => ({
            id: String(e._id || `${e.name}-${e.startDate}`),
            name: e.name || "Untitled Event",
            impactLevel: (e.impactLevel || "low") as "high" | "medium" | "low",
            upliftPct: Number(e.upliftPct || 0),
            area: e.area || (Array.isArray(e.areas) ? e.areas[0] : undefined),
            source: e.source || "market_template",
          }));
        setTodayEvents(items);
        const latestUpdatedAt = data.latestUpdatedAt
          ? new Date(data.latestUpdatedAt)
          : (data.events as any[]).reduce<Date | null>((latest, event) => {
              if (!event?.updatedAt) return latest;
              const current = new Date(event.updatedAt);
              if (!latest || current > latest) return current;
              return latest;
            }, null);
        setLastUpdatedAt(
          (latestUpdatedAt ?? new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        );
      } catch {
        // Best-effort only.
      }
    };

    const refreshProposalNotifications = async () => {
      try {
        const orgId = getOrgId();
        if (!orgId) return;
        const r = await fetch(`/api/v1/revenue/proposals?orgId=${orgId}&status=pending`);
        if (!r.ok) return;
        const payload = await r.json();
        const proposals = payload?.data?.proposals ?? [];
        if (disposed || !Array.isArray(proposals)) return;

        const now = new Date();
        const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

        const highRisk = proposals
          .filter((p: any) => String(p?.riskLevel || "").toLowerCase() === "high")
          .slice(0, 8)
          .map((p: any) => ({
            id: `proposal-high-${p._id}`,
            label: "High Risk Proposal",
            listingName: p.listingName || "Unknown Property",
            type: "high_risk" as const,
            updatedAt: p.updatedAt,
          }));

        const expiring = proposals
          .filter((p: any) => {
            if (!p?.date) return false;
            const proposalDate = new Date(`${p.date}T00:00:00`);
            return proposalDate >= now && proposalDate <= in48h;
          })
          .slice(0, 8)
          .map((p: any) => ({
            id: `proposal-exp-${p._id}`,
            label: "Expiring Proposal",
            listingName: p.listingName || "Unknown Property",
            type: "expiring" as const,
            updatedAt: p.updatedAt,
          }));

        setProposalNotifications([...highRisk, ...expiring]);
      } catch {
        // Best-effort only.
      }
    };

    const refreshBadges = async () => {
      await Promise.all([refreshGuestInbox(), refreshTodayEvents(), refreshProposalNotifications()]);
    };

    refreshBadges();
    const interval = window.setInterval(refreshBadges, 60_000);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, []);

  const visibleEvents = todayEvents.filter((e) => !dismissedNotificationIds.has(`event-${e.id}`));
  const visibleProposalNotifications = proposalNotifications.filter((p) => !dismissedNotificationIds.has(p.id));
  const visibleGuestNotifications = guestNotifications.filter((g) => !dismissedNotificationIds.has(g.id));
  const totalNotificationCount =
    visibleEvents.length + visibleProposalNotifications.length + visibleGuestNotifications.length;

  const dismissNotification = (id: string) => {
    setDismissedNotificationIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href.includes("?")) {
      const [path, query] = href.split("?");
      if (pathname !== path) return false;
      const urlParams = new URLSearchParams(query);
      for (const [key, value] of urlParams.entries()) {
        if (searchParams.get(key) !== value) return false;
      }
      return true;
    }
    return pathname.startsWith(href);
  };

  const NavItem = ({
    name,
    href,
    icon: Icon,
    showGuestBadge,
  }: {
    name: string;
    href: string;
    icon: any;
    showGuestBadge?: boolean;
  }) => {
    const active = isActive(href);
    const guestBadgeCount = showGuestBadge ? needsReplyCount : 0;
    const effectiveHref =
      showGuestBadge && pendingGuestTarget
        ? `/guest-chat?propertyId=${encodeURIComponent(pendingGuestTarget.propertyId)}&conversationId=${encodeURIComponent(pendingGuestTarget.conversationId)}`
        : href;

    const tourId = name === "Dashboard" ? "tour-sidebar-dashboard" 
                 : name === "Pricing" ? "tour-sidebar-pricing" 
                 : name === "Market" ? "tour-sidebar-market" 
                 : undefined;

    return (
      <Link
        href={effectiveHref}
        id={tourId}
        className={cn(
          "group relative flex items-center gap-3 px-3 py-2 text-body transition-colors duration-200 rounded-md mx-2",
          active
            ? "text-amber bg-primary/dim"
            : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
        )}
      >
        {active && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-amber rounded-r-full" />
        )}
        <Icon className={cn("h-4 w-4 shrink-0", active ? "text-amber" : "text-text-tertiary group-hover:text-text-secondary")} />
        <span className="flex-1 truncate">{name}</span>

        {guestBadgeCount > 0 && (
          <Badge className="bg-blue-500/80 text-white px-1.5 py-0 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold border-none">
            {guestBadgeCount}
          </Badge>
        )}
      </Link>
    );
  };

  return (
    <div className="flex h-full w-[232px] flex-col border-r border-border-default bg-surface-1 shrink-0 z-50">
      {/* Header */}
      <div className="px-6 py-6 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-xl font-bold tracking-tight text-amber">PriceOS</span>
            <span className="text-body-xs text-text-tertiary">Revenue Intelligence</span>
          </div>

          <DropdownMenu>
            <div className="flex flex-col items-end gap-1">
              <DropdownMenuTrigger asChild>
                <button
                  className="relative h-9 w-9 rounded-md border border-border-subtle bg-surface-2/60 text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors flex items-center justify-center"
                  title="Today's events"
                >
                  <Bell className="h-4 w-4" />
                  {totalNotificationCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber text-black text-[10px] font-bold leading-4 text-center">
                      {totalNotificationCount > 9 ? "9+" : totalNotificationCount}
                    </span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <span className="text-[10px] text-text-tertiary">
                {lastUpdatedAt ? `Updated ${lastUpdatedAt}` : "Updating..."}
              </span>
            </div>
            <DropdownMenuContent align="start" className="w-80 p-0 overflow-hidden">
              <div className="px-3 py-2.5 border-b border-border-subtle bg-surface-1">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-amber" />
                  <span className="text-xs font-bold uppercase tracking-wider text-text-primary">
                    Notifications
                  </span>
                </div>
                <p className="text-[11px] text-text-tertiary mt-1">
                  {totalNotificationCount === 0
                    ? "No active notifications."
                    : `${totalNotificationCount > 9 ? "9+" : totalNotificationCount} notification${totalNotificationCount > 1 ? "s" : ""} right now.`}
                </p>
              </div>

              <div className="max-h-72 overflow-y-auto">
                {totalNotificationCount === 0 ? (
                  <div className="px-3 py-4 text-[12px] text-text-tertiary">
                    No active guest, event, or proposal alerts right now.
                  </div>
                ) : (
                  <div className="divide-y divide-border-subtle">
                    {visibleGuestNotifications.slice(0, 8).map((notification) => (
                      <div
                        key={notification.id}
                        onClick={() =>
                          router.push(
                            `/guest-chat?propertyId=${encodeURIComponent(notification.propertyId)}&conversationId=${encodeURIComponent(notification.conversationId)}&highlight=1`
                          )
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            router.push(
                              `/guest-chat?propertyId=${encodeURIComponent(notification.propertyId)}&conversationId=${encodeURIComponent(notification.conversationId)}&highlight=1`
                            );
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        className="w-full text-left px-3 py-2.5 hover:bg-surface-2/70 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[12px] font-medium text-text-primary leading-snug">
                              New Guest Message
                            </p>
                            <p className="text-[11px] text-text-tertiary truncate">{notification.guestName}</p>
                            <p className="text-[10px] text-text-tertiary truncate mt-1">{notification.preview}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Badge className="text-[10px] border-none h-5 bg-blue-500/15 text-blue-400">
                              inbox
                            </Badge>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                dismissNotification(notification.id);
                              }}
                              className="h-5 w-5 rounded-full hover:bg-muted flex items-center justify-center"
                              title="Dismiss"
                            >
                              <X className="h-3 w-3 text-muted-foreground" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {visibleProposalNotifications.slice(0, 8).map((proposal) => (
                      <div
                        key={proposal.id}
                        onClick={() => router.push("/pricing")}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            router.push("/pricing");
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        className="w-full px-3 py-2.5 hover:bg-surface-2/70 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[12px] font-medium text-text-primary leading-snug">
                              {proposal.label}
                            </p>
                            <p className="text-[11px] text-text-tertiary truncate">{proposal.listingName}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Badge
                              className={cn(
                                "text-[10px] border-none h-5",
                                proposal.type === "high_risk"
                                  ? "bg-red-500/15 text-red-400"
                                  : "bg-primary/15 text-primary"
                              )}
                            >
                              {proposal.type === "high_risk" ? "high risk" : "expiring"}
                            </Badge>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                dismissNotification(proposal.id);
                              }}
                              className="h-5 w-5 rounded-full hover:bg-muted flex items-center justify-center"
                              title="Dismiss"
                            >
                              <X className="h-3 w-3 text-muted-foreground" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {visibleEvents.slice(0, 8).map((event) => (
                      <button
                        key={event.id}
                        onClick={() => router.push("/market?focus=today")}
                        className="w-full text-left px-3 py-2.5 hover:bg-surface-2/70 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[12px] font-medium text-text-primary leading-snug">{event.name}</p>
                          <div className="flex items-center gap-1">
                            <Badge
                              className={cn(
                                "text-[10px] border-none h-5",
                                event.impactLevel === "high"
                                  ? "bg-red-500/15 text-red-400"
                                  : event.impactLevel === "medium"
                                    ? "bg-primary/15 text-primary"
                                    : "bg-blue-500/15 text-blue-400"
                              )}
                            >
                              {event.impactLevel}
                            </Badge>
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                dismissNotification(`event-${event.id}`);
                              }}
                              className="h-5 w-5 rounded-full hover:bg-muted flex items-center justify-center"
                              title="Dismiss"
                            >
                              <X className="h-3 w-3 text-muted-foreground" />
                            </span>
                          </div>
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-[10px] text-text-tertiary">
                          <span className="inline-flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" /> +{event.upliftPct}%
                          </span>
                          {event.area && <span>{event.area}</span>}
                          <span className="uppercase">{event.source}</span>
                        </div>
                      </button>
                    ))}
                    {(visibleEvents.length > 8 || visibleProposalNotifications.length > 8 || visibleGuestNotifications.length > 8) && (
                      <div className="px-3 py-2 text-[10px] text-text-tertiary bg-surface-1">
                        +more notifications
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="px-3 py-2 border-t border-border-subtle bg-surface-1">
                <div className="flex items-center gap-3 text-[11px]">
                  <button
                    onClick={() => router.push("/market?focus=today")}
                    className="text-amber hover:text-amber/80 font-medium inline-flex items-center gap-1"
                  >
                    <CalendarDays className="h-3 w-3" />
                    Market events
                  </button>
                  <button
                    onClick={() => router.push("/pricing")}
                    className="text-amber hover:text-amber/80 font-medium inline-flex items-center gap-1"
                  >
                    <Clock3 className="h-3 w-3" />
                    Proposals
                  </button>
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex flex-1 flex-col gap-6 py-4 overflow-y-auto custom-scrollbar">
        <div className="flex flex-col gap-1">
          {BUSINESS_GROUP.map((item) => (
            <NavItem key={item.name} {...item} />
          ))}
        </div>

      </div>

      {/* Bottom */}
      <div className="pt-4 pb-6 flex flex-col gap-1 border-t border-border-subtle">
        <NavItem name="User Management" href="/users" icon={Users} />
        <NavItem name="Settings" href="/settings" icon={Settings} />
        <button
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            router.push("/login");
          }}
          className="group flex items-center gap-3 px-3 py-2 text-body text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors duration-200 rounded-md mx-2"
        >
          <LogOut className="h-4 w-4 text-text-tertiary group-hover:text-text-secondary" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Search, Send, Sparkles, Bot, Home, Calendar, Star, Clock,
  CheckCheck, ThumbsUp, ThumbsDown, X, Loader2, RefreshCw, Activity,
  FlaskConical, Zap, FileText, ChevronDown, ChevronUp, Pencil, Plus, Info, Building2,
  Wrench, ExternalLink, ChevronLeft, ChevronRight, PanelRightClose, PanelRightOpen
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format, differenceInDays } from "date-fns";
import { toast } from "sonner";
import type { PropertyWithMetrics } from "@/types";

// ── Types ────────────────────────────────────────────────────────────────────

type Sentiment = "positive" | "neutral" | "negative";
type Channel = "Airbnb" | "Booking.com" | "Direct" | "Vrbo";
type ConvStatus = "active" | "resolved";

interface InboxConversation {
  id: string;
  guestName: string;
  guestInitials: string;
  avatarColor: string;
  channel: Channel;
  property: string;
  propertyId: string;
  checkIn: string;
  checkOut: string;
  lastMessage: string;
  unread: number;
  sentiment: Sentiment;
  rating: number | null;
  status: ConvStatus;
  messages: InboxMessage[];
}

interface InboxMessage {
  id: string;
  role: "guest" | "host";
  content: string;
  time: string;
}

interface BackendConversation {
  id: string;
  guestName?: string;
  lastMessage?: string;
  status?: "needs_reply" | "resolved";
  messages?: Array<{ id?: string; sender: "guest" | "admin"; text: string; time?: string; timestamp?: string }>;
  listingId?: string;
  unreadCount?: number;
  dateFrom?: string;
  dateTo?: string;
  channel?: string;
}

const CHANNEL_COLORS: Record<Channel, string> = {
  Airbnb: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  "Booking.com": "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Direct: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Vrbo: "bg-purple-500/10 text-purple-400 border-purple-500/20",
};

const SENTIMENT_CONFIG: Record<Sentiment, { color: string; label: string }> = {
  positive: { color: "text-emerald-400", label: "Happy" },
  neutral: { color: "text-amber", label: "Neutral" },
  negative: { color: "text-red-400", label: "Concerned" },
};

const AVATAR_COLORS = [
  "bg-blue-500/20 text-blue-400", "bg-emerald-500/20 text-emerald-400",
  "bg-purple-500/20 text-purple-400", "bg-amber/20 text-amber",
  "bg-rose-500/20 text-rose-400", "bg-cyan-500/20 text-cyan-400",
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

function guessChannel(c: BackendConversation): Channel {
  const raw = (c.channel || "").toLowerCase();
  if (raw.includes("airbnb")) return "Airbnb";
  if (raw.includes("booking")) return "Booking.com";
  if (raw.includes("vrbo") || raw.includes("homeaway")) return "Vrbo";
  return "Direct";
}

function guessSentiment(messages: InboxMessage[]): Sentiment {
  const lastGuest = [...messages].reverse().find((m) => m.role === "guest");
  if (!lastGuest) return "neutral";
  const text = lastGuest.content.toLowerCase();
  if (["complaint", "broken", "not working", "issue", "problem", "terrible", "bad", "angry"].some((w) => text.includes(w))) return "negative";
  if (["thank", "great", "perfect", "wonderful", "amazing", "love", "excellent", "happy"].some((w) => text.includes(w))) return "positive";
  return "neutral";
}

function mapConversation(c: BackendConversation, property: PropertyWithMetrics, index: number): InboxConversation {
  const messages: InboxMessage[] = (c.messages || []).map((m, i) => ({
    id: m.id ?? `msg-${i}`,
    role: m.sender === "admin" ? "host" : "guest",
    content: m.text,
    time: m.time || m.timestamp || "",
  }));
  const lastMsg = messages.length > 0 ? messages[messages.length - 1].content : (c.lastMessage || "");
  return {
    id: `${property.id}-${c.id}`,
    guestName: c.guestName || "Unknown Guest",
    guestInitials: getInitials(c.guestName || "UG"),
    avatarColor: AVATAR_COLORS[index % AVATAR_COLORS.length],
    channel: guessChannel(c),
    property: property.name || "Property",
    propertyId: property.id,
    checkIn: c.dateFrom || "",
    checkOut: c.dateTo || "",
    lastMessage: lastMsg.length > 80 ? lastMsg.slice(0, 77) + "…" : lastMsg,
    unread: c.unreadCount ?? (c.status === "needs_reply" ? 1 : 0),
    sentiment: guessSentiment(messages),
    rating: null,
    status: c.status === "resolved" ? "resolved" : "active",
    messages,
  };
}

// ── ConversationCard ─────────────────────────────────────────────────────────

function ConversationCard({ conv, selected, onClick }: { conv: InboxConversation; selected: boolean; onClick: () => void }) {
  const sentConf = SENTIMENT_CONFIG[conv.sentiment];
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-3 rounded-xl border transition-all overflow-hidden flex flex-col gap-1",
        selected ? "bg-amber/8 border-amber/25" : "hover:bg-surface-2 border-transparent hover:border-border-default"
      )}
    >
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className={cn("h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0", conv.avatarColor)}>
            {conv.guestInitials}
          </div>
          <span className={cn("text-[12px] font-semibold truncate min-w-0", selected ? "text-amber" : "text-text-primary")}>
            {conv.guestName}
          </span>
        </div>
        {conv.unread > 0 && (
          <span className="h-4 w-4 rounded-full bg-amber text-black text-[9px] font-bold flex items-center justify-center shrink-0">
            {conv.unread}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 min-w-0">
        <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 h-4 font-medium shrink-0", CHANNEL_COLORS[conv.channel])}>
          {conv.channel}
        </Badge>
        <span className="text-[9px] text-text-muted truncate min-w-0" title={conv.property}>
          {conv.property}
        </span>
      </div>

      <div className="w-full min-w-0">
        <p className="text-[10px] text-text-muted truncate min-w-0 overflow-hidden">
          {conv.lastMessage}
        </p>
      </div>

      <div className="flex items-center justify-between mt-0.5 min-w-0">
        <div className="flex-1 min-w-0">
          {conv.checkIn && conv.checkOut && (
            <div className="flex items-center gap-1 text-text-muted truncate">
              <Calendar className="h-2.5 w-2.5 shrink-0" />
              <span className="text-[9px]">
                {format(new Date(conv.checkIn), "d MMM")} – {format(new Date(conv.checkOut), "d MMM")}
              </span>
            </div>
          )}
        </div>
        <span className={cn("text-[9px] font-medium shrink-0 ml-2", sentConf.color)}>{sentConf.label}</span>
      </div>
    </button>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function GuestInboxWired({ orgId, properties }: { orgId: string; properties: PropertyWithMetrics[] }) {
  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | ConvStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showDraft, setShowDraft] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [aiDraft, setAiDraft] = useState("");
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [autoReply, setAutoReply] = useState(false);
  const [isSavingComms, setIsSavingComms] = useState(false);
  const [summary, setSummary] = useState<{
    sentiment: string;
    sentimentScore: number;
    confidence: number;
    themes: string[];
    actionItems: string[];
    bulletPoints?: string[];
    totalConversations?: number;
    needsReplyCount?: number;
  } | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  // Draft enhancement state
  const [isEditingDraft, setIsEditingDraft] = useState(false);
  const [editableDraft, setEditableDraft] = useState("");
  const [showRewrite, setShowRewrite] = useState(false);
  const [rewriteContext, setRewriteContext] = useState("");
  const [isRewriting, setIsRewriting] = useState(false);
  const [draftFeedback, setDraftFeedback] = useState<"good" | "bad" | null>(null);
  const [draftSentiment, setDraftSentiment] = useState<Sentiment | null>(null);
  const [draftConfidence, setDraftConfidence] = useState<number | null>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [isLoadingTickets, setIsLoadingTickets] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const router = useRouter();
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const [activePropertyIds, setActivePropertyIds] = useState<string[]>(properties.map(p => p.id));
  const isResizing = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const api = process.env.NEXT_PUBLIC_API_URL ?? "/api";

  // Load persisted comms settings on mount
  useEffect(() => {
    fetch(`${api}/comms-settings?orgId=${orgId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        setTestMode(d.liveMode);
        setAutoReply(d.autoReply);
      })
      .catch(() => {});
  }, [orgId, api]);

  const persistCommsMode = async (liveMode: boolean, autoReplyVal: boolean) => {
    setIsSavingComms(true);
    try {
      await fetch(`${api}/comms-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, liveMode, autoReply: autoReplyVal }),
      });
    } catch {
      toast.error("Could not save comms setting");
    } finally {
      setIsSavingComms(false);
    }
  };

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", stopResizing);
  }, []);

  const stopResizing = useCallback(() => {
    isResizing.current = false;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", stopResizing);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing.current) return;
    // sidebar width: e.clientX - 232 (sidebar width) - 8 (margin)
    const newWidth = Math.max(200, Math.min(480, e.clientX - 232));
    setSidebarWidth(newWidth);
  }, []);

  const fetchAll = useCallback(async () => {
    if (!properties.length) return;
    setIsLoading(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("priceos-token") : null;
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
      const results = await Promise.allSettled(
        properties.map((p) =>
          fetch(`${api}/hostaway/conversations/cached?listingId=${p.id}&orgId=${orgId}`, { headers })
            .then((r) => r.ok ? r.json() : { conversations: [] })
            .then((data) =>
              ((data.conversations || []) as BackendConversation[]).map((c, i) => mapConversation(c, p, i))
            )
        )
      );
      const merged: InboxConversation[] = [];
      results.forEach((r) => { if (r.status === "fulfilled") merged.push(...r.value); });
      // Deduplicate: same conversation id can appear across multiple property fetches
      const seen = new Set<string>();
      const deduped = merged.filter((c) => {
        const key = `${c.propertyId}-${c.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      deduped.sort((a, b) => {
        if (a.status === "active" && b.status !== "active") return -1;
        if (b.status === "active" && a.status !== "active") return 1;
        return b.unread - a.unread;
      });
      setConversations(deduped);
      if (!selected && deduped.length > 0) setSelected(deduped[0].id);
    } catch {
      toast.error("Failed to load conversations");
    } finally {
      setIsLoading(false);
    }
  }, [orgId, properties, api, selected]);

  useEffect(() => { fetchAll(); }, [orgId, properties.length]);
  // Re-fetch when properties change
  useEffect(() => {
    const ids = properties.map(p => p.id);
    setActivePropertyIds(prev => {
      // If prev is empty (first load), take all
      if (prev.length === 0) return ids;
      // Otherwise keep only those that still exist
      return prev.filter(id => ids.includes(id));
    });
  }, [properties]);

  useEffect(() => {
    if (selected) {
      setSummary(null);
      setShowSummary(false);
      fetchTicketsForSelected();
    }
  }, [selected]);

  const fetchTicketsForSelected = async () => {
    if (!selected) return;
    setIsLoadingTickets(true);
    try {
      const c = conversations.find(x => x.id === selected);
      if (!c) return;
      
      const res = await fetch(`${api}/guest-agent/tickets?orgId=${orgId}`);
      if (res.ok) {
        const data = await res.json();
        const allTickets = data.tickets || [];
        const filtered = allTickets.filter((t: any) => 
          String(t.threadId) === String(c.id) || 
          String(t.reservationId) === String(c.id) ||
          (t.guestName && t.guestName.toLowerCase() === c.guestName.toLowerCase())
        );
        setTickets(filtered);
      }
    } catch (err) {
      console.error("Failed to fetch tickets for guest", err);
    } finally {
      setIsLoadingTickets(false);
    }
  };

  const handleTicketClick = (ticketId: string) => {
    router.push(`/operations?ticketId=${ticketId}`);
  };

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: "smooth" }); }, [selected]);

  const conv = conversations.find((c) => c.id === selected) ?? null;
  const counts = {
    all: conversations.length,
    active: conversations.filter(c => c.status === "active").length,
    resolved: conversations.filter(c => c.status === "resolved").length,
  };

  const filtered = conversations.filter((c) => {
    if (!activePropertyIds.includes(c.propertyId)) return false;
    if (filterStatus !== "all" && c.status !== filterStatus) return false;
    if (searchQuery && !c.guestName.toLowerCase().includes(searchQuery.toLowerCase()) && !c.property.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const handleNewChat = () => {
    toast.info("Opening new test chat session...");
    // Mock creating a new test conversation
    const newTestConv: InboxConversation = {
      id: `test-${Date.now()}`,
      guestName: "Test Guest",
      guestInitials: "TG",
      avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
      channel: "Direct",
      property: properties[0]?.name || "Test Property",
      propertyId: properties[0]?.id || "test-prop",
      checkIn: format(new Date(), "yyyy-MM-dd"),
      checkOut: format(new Date(Date.now() + 86400000 * 3), "yyyy-MM-dd"),
      lastMessage: "Start a new test conversation",
      unread: 0,
      sentiment: "neutral",
      rating: null,
      status: "active",
      messages: [],
    };
    setConversations(prev => [newTestConv, ...prev]);
    setSelected(newTestConv.id);
  };

  const detectDraftSentiment = (text: string): Sentiment => {
    const lower = text.toLowerCase();
    if (/\bsorry\b|\bapologi|\bunfortunately\b|\bunable\b|\bcannot\b|\bcan't\b|\bregret\b/.test(lower)) return "neutral";
    if (/\bwonderful\b|\bdelighted\b|\bexcited\b|\bhappy\b|\bperfect\b|\bamazing\b|\bgreat\b|\blooking forward\b/.test(lower)) return "positive";
    return "positive";
  };

  const detectDraftConfidence = (text: string, guestFirstName: string): number => {
    let score = 50;
    if (text.length > 80) score += 8;
    if (text.length > 200) score += 8;
    if (text.length > 420) score -= 12; // overly long
    if (/\[.*?\]/.test(text)) score -= 25; // unfilled placeholders
    if (/\.\.\.$/.test(text)) score -= 10; // trailing ellipsis
    if (guestFirstName && text.includes(guestFirstName)) score += 10;
    if (/thank you|looking forward|welcome|would be happy|please feel free/i.test(text)) score += 10;
    if (/unfortunately|cannot|unable/i.test(text)) score -= 5;
    return Math.max(25, Math.min(95, score));
  };

  const handleFeedback = async (type: "good" | "bad") => {
    if (!conv) return;
    setDraftFeedback(type);
    if (type === "bad") {
      setShowRewrite(true);
      toast.info("Add context and let Aria rewrite the draft");
    } else {
      toast.success("Marked as helpful — Aria learns from this");
    }
    try {
      await fetch(`${api}/hostaway/draft-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, conversationId: conv.id, feedback: type, draft: aiDraft }),
      });
    } catch { /* silent — feedback is best-effort */ }
  };

  const handleRewrite = async () => {
    if (!conv) return;
    setIsRewriting(true);
    toast.loading("Rewriting draft…", { id: "ai-rewrite" });
    try {
      const res = await fetch("/api/hostaway/suggest-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: conv.messages.map((m) => ({ sender: m.role === "host" ? "admin" : "guest", text: m.content, time: m.time })),
          guestName: conv.guestName,
          propertyName: conv.property,
          listingId: conv.propertyId,
          orgId,
          additionalContext: rewriteContext.trim() || undefined,
          sessionId: `inbox-${conv.id}-${Date.now()}`,
          threadId: conv.id,
        }),
      });
      if (!res.ok) throw new Error("Agent unavailable");
      const data = await res.json();
      const text: string = data.reply || "";
      const trimmed = text.trim();
      if (!trimmed) throw new Error("Empty draft");
      setAiDraft(trimmed);
      setEditableDraft(trimmed);
      setDraftSentiment((data.sentiment as Sentiment) || detectDraftSentiment(trimmed));
      setDraftConfidence(detectDraftConfidence(trimmed, conv.guestName.split(" ")[0]));
      setDraftFeedback(null);
      setShowRewrite(false);
      setRewriteContext("");
      setIsEditingDraft(false);
      toast.success("Draft rewritten", { id: "ai-rewrite" });
    } catch {
      toast.error("Rewrite failed", { id: "ai-rewrite" });
    } finally {
      setIsRewriting(false);
    }
  };

  const handleGenerateDraft = async () => {
    if (!conv) return;
    setIsGeneratingDraft(true);
    toast.loading("Generating AI draft…", { id: "ai-draft" });
    try {
      const res = await fetch("/api/hostaway/suggest-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: conv.messages.map((m) => ({ sender: m.role === "host" ? "admin" : "guest", text: m.content, time: m.time })),
          guestName: conv.guestName,
          propertyName: conv.property,
          listingId: conv.propertyId,
          orgId,
          sessionId: `inbox-${conv.id}-${Date.now()}`,
          threadId: conv.id,
        }),
      });
      if (!res.ok) throw new Error("Agent unavailable");
      const data = await res.json();
      const text: string = data.reply || "";
      const trimmed = text.trim();
      if (!trimmed) throw new Error("Empty draft");
      setAiDraft(trimmed);
      setEditableDraft(trimmed);
      setDraftSentiment((data.sentiment as Sentiment) || detectDraftSentiment(trimmed));
      setDraftConfidence(detectDraftConfidence(trimmed, conv.guestName.split(" ")[0]));
      setDraftFeedback(null);
      setIsEditingDraft(false);
      setShowRewrite(false);
      setRewriteContext("");
      setShowDraft(true);
      // Auto-reply mode: pre-populate the textarea immediately
      if (autoReply) setDraftText(trimmed);
      toast.success(autoReply ? "AI draft auto-staged — review & send" : "AI draft ready", { id: "ai-draft" });
    } catch {
      toast.error("Failed to generate draft", { id: "ai-draft" });
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  const handleSend = async () => {
    if (!draftText.trim() || !conv) return;
    setIsSending(true);
    try {
      const hostawayConvId = conv.id.slice(conv.propertyId.length + 1);
      const res = await fetch(`${api}/hostaway/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: hostawayConvId, text: draftText.trim() }),
      });
      if (!res.ok) throw new Error("API error");
      const data = await res.json().catch(() => ({}));
      const newMsg: InboxMessage = {
        id: `msg-${Date.now()}`,
        role: "host",
        content: draftText.trim(),
        time: format(new Date(), "d MMM, HH:mm"),
      };
      setConversations((prev) =>
        prev.map((c) => c.id === conv.id ? { ...c, messages: [...c.messages, newMsg], status: "resolved", unread: 0 } : c)
      );
      setDraftText("");
      toast.success(
        data.delivered
          ? "Reply sent to guest via Hostaway"
          : "Reply saved (local only — guest delivery is disabled)"
      );
    } catch {
      toast.error("Failed to save reply");
    } finally {
      setIsSending(false);
    }
  };

  const generateSummary = async () => {
    if (!conv) return;
    setIsGeneratingSummary(true);
    try {
      const response = await fetch(`${api}/guest-agent/threads/${conv.id}/summary?orgId=${orgId}`, {
        method: "POST"
      });
      if (!response.ok) throw new Error("Failed to generate summary");
      const data = await response.json();
      setSummary(data);
      setShowSummary(true);
      toast.success("Summary generated");
    } catch (error) {
      console.error("Summary error:", error);
      toast.error("Failed to generate summary");
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const unreadTotal = conversations.filter((c) => c.unread > 0).length;

  return (
    <>
      <TooltipProvider>
        <div className="flex h-full w-full overflow-hidden">
      {/* Panel 1: Conversation List */}
      <div 
        style={{ width: sidebarWidth }}
        className="shrink-0 flex flex-col border-r border-border-default bg-surface-1 relative"
      >
        <div className="px-3 pt-4 pb-2">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-text-primary">Guest Inbox</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-text-muted hover:text-text-primary cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <div className="space-y-1.5 p-1">
                    <p className="font-semibold text-[11px]">Conversation Categories</p>
                    <p className="text-[10px] text-text-muted leading-relaxed">
                      <span className="text-amber font-medium">All:</span> View every conversation across your properties.<br/>
                      <span className="text-amber font-medium">Active:</span> Open conversations requiring attention or ongoing discussions.<br/>
                      <span className="text-amber font-medium">Resolved:</span> Completed threads or closed guest requests.
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex items-center gap-1.5">
              {unreadTotal > 0 && (
                <Badge variant="outline" className="text-[10px] border-amber/30 text-amber bg-amber/5">{unreadTotal} new</Badge>
              )}
              <button onClick={fetchAll} disabled={isLoading} className="p-1 rounded text-text-muted hover:text-text-primary transition-colors" title="Refresh">
                <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
              </button>
            </div>
          </div>
          {/* Mode toggles */}
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => { const next = !testMode; setTestMode(next); persistCommsMode(next, autoReply); }}
              title={testMode ? "Switch to Live Mode (agent active)" : "Switch to Test/Paused Mode (human-only)"}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold border transition-colors",
                testMode
                  ? "bg-purple-500/10 border-purple-500/30 text-purple-400"
                  : "bg-surface-2 border-border-default text-text-muted hover:text-text-primary"
              )}
            >
              <FlaskConical className="h-2.5 w-2.5" />
              {testMode ? "Test" : "Live"}
            </button>
            <button
              onClick={() => { const next = !autoReply; setAutoReply(next); persistCommsMode(testMode, next); }}
              title={autoReply ? "Auto-reply ON — AI sends directly" : "Auto-reply OFF — queued for PM approval"}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold border transition-colors",
                autoReply
                  ? "bg-amber/10 border-amber/30 text-amber"
                  : "bg-surface-2 border-border-default text-text-muted hover:text-text-primary"
              )}
            >
              <Zap className="h-2.5 w-2.5" />
              {autoReply ? "Auto" : "Manual"}
            </button>

            {testMode && (
              <button
                onClick={handleNewChat}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold bg-amber text-black hover:bg-amber/90 transition-colors ml-auto"
              >
                <Plus className="h-2.5 w-2.5" />
                New Chat
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 mb-2">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-border-default flex-1">
              <Search className="h-3 w-3 text-text-muted shrink-0" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search guests or properties…"
                className="bg-transparent text-[11px] text-text-primary placeholder:text-text-muted outline-none flex-1 min-w-0"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8 shrink-0 rounded-lg bg-surface-2 border-border-default hover:bg-surface-3">
                  <Building2 className="h-3.5 w-3.5 text-text-muted" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-surface-2 border-border-default">
                <div className="px-2 py-1.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider">Properties</div>
                {properties.map((p) => (
                  <DropdownMenuCheckboxItem
                    key={p.id}
                    checked={activePropertyIds.includes(p.id)}
                    onSelect={(e) => {
                      e.preventDefault();
                      const isCurrentlyActive = activePropertyIds.includes(p.id);
                      const nextActive = !isCurrentlyActive;
                      
                      setActivePropertyIds(prev => 
                        nextActive ? [...prev, p.id] : prev.filter(id => id !== p.id)
                      );
                      
                      if (nextActive) {
                        const firstConv = conversations.find(c => c.propertyId === p.id);
                        if (firstConv) {
                          setSelected(firstConv.id);
                        }
                      }
                    }}
                    className="text-[11px] focus:bg-amber/10 focus:text-amber"
                  >
                    {p.name}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex gap-1 flex-wrap">
            {(["all", "active", "resolved"] as const).map((s) => (
              <Tooltip key={s}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setFilterStatus(s)}
                    className={cn(
                      "text-[9px] font-medium px-2 py-0.5 rounded-full border transition-colors capitalize whitespace-nowrap",
                      filterStatus === s ? "bg-amber/10 border-amber/30 text-amber" : "border-border-default text-text-muted hover:text-text-secondary"
                    )}
                  >
                    {s} <span className="opacity-60 ml-0.5">{counts[s]}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-[10px] capitalize">{s} conversations</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
        
        {/* Resizer handle */}
        <div 
          onMouseDown={startResizing}
          className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-amber/40 active:bg-amber/60 z-10 transition-colors"
        />
        <ScrollArea className="flex-1">
          <div className="px-2 flex flex-col gap-0.5 pb-2">
            {isLoading && conversations.length === 0 ? (
              <div className="flex flex-col gap-0.5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="p-2.5 rounded-lg animate-pulse">
                    <div className="flex items-start gap-2">
                      <div className="h-8 w-8 rounded-full bg-white/8 shrink-0" />
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="h-2.5 rounded-full bg-white/8 w-24" />
                          <div className="h-2 rounded-full bg-white/8 w-8" />
                        </div>
                        <div className="h-2 rounded-full bg-white/8 w-full" />
                        <div className="h-2 rounded-full bg-white/8 w-3/4" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-text-muted">
                <span className="text-[11px]">No conversations found</span>
              </div>
            ) : (
              filtered.map((c) => (
                <ConversationCard
                  key={`${c.propertyId}-${c.id}`}
                  conv={c}
                  selected={selected === c.id}
                  onClick={() => { setSelected(c.id); setShowDraft(false); setDraftText(""); setAiDraft(""); setEditableDraft(""); setIsEditingDraft(false); setShowRewrite(false); setRewriteContext(""); setDraftFeedback(null); setDraftSentiment(null); setDraftConfidence(null); }}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Panel 2: Message Thread */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-border-default">
        <div className={cn(
          "flex items-center gap-4 px-4 py-1.5 border-b shrink-0",
          testMode ? "bg-purple-500/10 border-purple-500/20" : "bg-emerald-500/5 border-emerald-500/10"
        )}>
          <div className="flex items-center gap-2">
            {testMode ? <FlaskConical className="h-3 w-3 text-purple-400" /> : <Activity className="h-3 w-3 text-emerald-400" />}
            <span className={cn("text-[9px] font-bold tracking-wider", testMode ? "text-purple-300" : "text-emerald-400")}>
              {testMode ? "TEST MODE" : "LIVE MODE"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className={cn("h-1.5 w-1.5 rounded-full animate-pulse", autoReply ? "bg-amber" : "bg-text-muted")} />
            <span className="text-[10px] text-text-secondary">
              <span className="font-semibold text-text-primary">{autoReply ? "Auto-Reply Enabled:" : "Manual Mode:"}</span>
              {" "}
              {autoReply 
                ? "AI agent will directly send the replies to the guest." 
                : "Generate AI Draft first, then review and send manually."}
            </span>
          </div>
        </div>
        {conv ? (
          <>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-default bg-surface-1 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className={cn("h-9 w-9 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0", conv.avatarColor)}>
                  {conv.guestInitials}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-text-primary">{conv.guestName}</span>
                    <Badge variant="outline" className={cn("text-[9px] px-1.5 h-4", CHANNEL_COLORS[conv.channel])}>{conv.channel}</Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Home className="h-2.5 w-2.5 text-text-muted" />
                    <span className="text-[10px] text-text-muted">{conv.property}</span>
                    {conv.checkIn && conv.checkOut && (
                      <>
                        <span className="text-[10px] text-text-muted">·</span>
                        <Calendar className="h-2.5 w-2.5 text-text-muted" />
                        <span className="text-[10px] text-text-muted">
                          {format(new Date(conv.checkIn), "d MMM")} – {format(new Date(conv.checkOut), "d MMM")}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={handleGenerateDraft}
                disabled={isGeneratingDraft}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors",
                  showDraft ? "bg-amber text-black border-amber" : "border-amber/30 text-amber bg-amber/5 hover:bg-amber/10",
                  isGeneratingDraft && "opacity-60 cursor-not-allowed"
                )}
              >
                {isGeneratingDraft ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bot className="h-3 w-3" />}
                {isGeneratingDraft ? "Drafting…" : "AI Draft"}
              </button>
            </div>

            <ScrollArea className="flex-1 px-4 py-4">
              <div className="flex flex-col gap-4">
                {conv.messages.length === 0 ? (
                  <div className="flex items-center justify-center py-12 text-text-muted">
                    <span className="text-[11px]">No messages yet</span>
                  </div>
                ) : conv.messages.map((msg) => {
                  const isGuest = msg.role === "guest";
                  return (
                    <div key={msg.id} className={cn("flex gap-2.5", isGuest ? "flex-row" : "flex-row-reverse")}>
                      <div className={cn("h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold", isGuest ? conv.avatarColor : "bg-amber/10 text-amber border border-amber/20")}>
                        {isGuest ? conv.guestInitials : "You"}
                      </div>
                      <div className={cn("max-w-[85%] flex flex-col gap-1", isGuest ? "items-start" : "items-end")}>
                        <div className={cn(
                          "rounded-2xl px-3.5 py-2.5 text-[12px] leading-relaxed whitespace-pre-wrap break-words overflow-hidden", 
                          isGuest 
                            ? "bg-surface-2 border border-border-default text-text-primary rounded-bl-md" 
                            : "bg-amber text-black rounded-br-md font-medium"
                        )}>
                          {msg.content}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] text-text-muted">{msg.time}</span>
                          {!isGuest && <CheckCheck className="h-2.5 w-2.5 text-amber" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={scrollRef} />
              </div>
            </ScrollArea>

            {showDraft && aiDraft && (
              <div className="mx-4 mb-3 rounded-xl border border-amber/25 bg-amber/5 p-3 shrink-0">
                {/* Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Sparkles className="h-3.5 w-3.5 text-amber" />
                    <span className="text-[11px] font-semibold text-amber">AI Draft Reply</span>
                    {draftSentiment && (
                      <span className={cn(
                        "text-[9px] px-1.5 py-0.5 rounded-full font-medium",
                        draftSentiment === "positive" && "bg-emerald-500/15 text-emerald-400",
                        draftSentiment === "neutral" && "bg-amber/15 text-amber",
                        draftSentiment === "negative" && "bg-red-400/15 text-red-400",
                      )}>
                        {draftSentiment === "positive" ? "Positive tone" : draftSentiment === "neutral" ? "Neutral tone" : "Cautious tone"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleFeedback("good")}
                      title="Mark as good — helps Aria improve"
                      className={cn(
                        "flex items-center gap-1 text-[10px] transition-colors",
                        draftFeedback === "good" ? "text-emerald-400" : "text-text-muted hover:text-emerald-400"
                      )}
                    >
                      <ThumbsUp className={cn("h-3 w-3", draftFeedback === "good" && "fill-emerald-400")} /> Good
                    </button>
                    <button
                      onClick={() => handleFeedback("bad")}
                      title="Mark as bad — opens rewrite panel"
                      className={cn(
                        "flex items-center gap-1 text-[10px] transition-colors",
                        draftFeedback === "bad" ? "text-red-400" : "text-text-muted hover:text-red-400"
                      )}
                    >
                      <ThumbsDown className={cn("h-3 w-3", draftFeedback === "bad" && "fill-red-400")} /> Bad
                    </button>
                    <button onClick={() => { setShowDraft(false); setIsEditingDraft(false); setShowRewrite(false); }}>
                      <X className="h-3.5 w-3.5 text-text-muted hover:text-text-primary" />
                    </button>
                  </div>
                </div>

                {/* Draft text — read or edit mode */}
                {isEditingDraft ? (
                  <Textarea
                    value={editableDraft}
                    onChange={(e) => setEditableDraft(e.target.value)}
                    className="text-[11px] min-h-[80px] resize-none border-amber/30 bg-surface-2 text-text-primary mb-2 focus-visible:ring-amber/40"
                    rows={4}
                    autoFocus
                  />
                ) : (
                  <p className="text-[11px] text-text-secondary leading-relaxed mb-2">{aiDraft}</p>
                )}

                {/* Edit + Rewrite action row */}
                <div className="flex items-center gap-2 mb-2">
                  {isEditingDraft ? (
                    <>
                      <button
                        onClick={() => { setAiDraft(editableDraft); setIsEditingDraft(false); }}
                        className="flex items-center gap-1 text-[10px] px-3 py-1 rounded-md border border-amber bg-amber text-black font-semibold hover:bg-amber/90 transition-colors"
                      >
                        <CheckCheck className="h-3 w-3" />
                        Save Changes
                      </button>
                      <button
                        onClick={() => { setIsEditingDraft(false); setEditableDraft(aiDraft); }}
                        className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border border-border-default text-text-muted hover:text-text-primary transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => { setIsEditingDraft(true); setEditableDraft(aiDraft); }}
                      className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border border-border-default text-text-muted hover:text-text-primary hover:border-amber/30 transition-colors"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </button>
                  )}
                  <button
                    onClick={() => setShowRewrite(!showRewrite)}
                    className={cn(
                      "flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border transition-colors",
                      showRewrite
                        ? "border-purple-400/40 text-purple-400 bg-purple-400/10"
                        : "border-border-default text-text-muted hover:text-text-primary hover:border-purple-400/30"
                    )}
                  >
                    <RefreshCw className="h-3 w-3" />
                    Rewrite
                  </button>
                </div>

                {/* Rewrite context panel */}
                {showRewrite && (
                  <div className="mb-2 rounded-lg bg-purple-400/5 border border-purple-400/20 p-2">
                    <p className="text-[10px] text-purple-300 mb-1.5 font-medium">Add context for rewrite <span className="opacity-60">(optional)</span></p>
                    <Textarea
                      value={rewriteContext}
                      onChange={(e) => setRewriteContext(e.target.value)}
                      placeholder="e.g. 'Make it shorter', 'Sound more formal', 'Mention early check-in option'"
                      className="text-[11px] min-h-[44px] resize-none border-purple-400/20 bg-transparent text-text-primary placeholder:text-text-muted mb-2 focus-visible:ring-purple-400/40"
                      rows={2}
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleRewrite}
                        disabled={isRewriting}
                        className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-md bg-purple-500 text-white hover:bg-purple-500/90 disabled:opacity-50 transition-colors"
                      >
                        {isRewriting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        {isRewriting ? "Rewriting…" : "Rewrite draft"}
                      </button>
                      <button
                        onClick={() => { setShowRewrite(false); setRewriteContext(""); }}
                        className="text-[10px] text-text-muted hover:text-text-primary transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Sentiment + Confidence signal bars */}
                {(draftSentiment || draftConfidence != null) && (
                  <div className="mb-2.5 pt-2 pb-2.5 border-t border-amber/10 space-y-2">
                    {draftSentiment && (() => {
                      const map = {
                        positive: { label: "Positive", pct: 88, bar: "bg-emerald-500", text: "text-emerald-400" },
                        neutral:  { label: "Neutral",  pct: 52, bar: "bg-amber",        text: "text-amber" },
                        negative: { label: "Cautious", pct: 28, bar: "bg-red-400",      text: "text-red-400" },
                      } as const;
                      const s = map[draftSentiment];
                      return (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] font-medium text-text-muted uppercase tracking-wide">Tone</span>
                            <span className={cn("text-[9px] font-semibold", s.text)}>{s.label}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                            <div className={cn("h-full rounded-full transition-all duration-700", s.bar)} style={{ width: `${s.pct}%` }} />
                          </div>
                        </div>
                      );
                    })()}
                    {draftConfidence != null && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] font-medium text-text-muted uppercase tracking-wide">Confidence</span>
                          <span className={cn(
                            "text-[9px] font-semibold",
                            draftConfidence >= 75 ? "text-blue-400" : draftConfidence >= 50 ? "text-sky-400" : "text-slate-400"
                          )}>
                            {draftConfidence >= 75 ? "High" : draftConfidence >= 50 ? "Medium" : "Low"} · {draftConfidence}%
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-700",
                              draftConfidence >= 75 ? "bg-blue-400" : draftConfidence >= 50 ? "bg-sky-400" : "bg-slate-400"
                            )}
                            style={{ width: `${draftConfidence}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Use this draft */}
                <button
                  onClick={() => {
                    setDraftText(isEditingDraft ? editableDraft : aiDraft);
                    setShowDraft(false);
                    setIsEditingDraft(false);
                    setShowRewrite(false);
                  }}
                  className="w-full py-1.5 rounded-lg bg-amber text-black text-[11px] font-semibold hover:bg-amber/90 transition-colors"
                >
                  Use this draft
                </button>
              </div>
            )}

            <div className="px-4 pb-4 shrink-0">
              <div className="rounded-xl border border-border-default bg-surface-1 p-2 focus-within:border-amber/40 transition-colors">
                <Textarea
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  placeholder="Write a reply…"
                  className="min-h-[60px] max-h-28 resize-none border-0 bg-transparent p-1 text-[12px] text-text-primary placeholder:text-text-muted focus-visible:ring-0 focus-visible:ring-offset-0"
                  rows={2}
                />
                <div className="flex items-center justify-between pt-1.5 px-1">
                  <button onClick={handleGenerateDraft} disabled={isGeneratingDraft} className="flex items-center gap-1 text-[10px] text-amber hover:text-amber/80 font-medium transition-colors disabled:opacity-50">
                    {isGeneratingDraft ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bot className="h-3 w-3" />}
                    Generate AI draft
                  </button>
                  <Button size="sm" onClick={handleSend} disabled={!draftText.trim() || isSending} className="h-7 px-3 bg-amber text-black hover:bg-amber/90 text-[11px] gap-1 disabled:opacity-40">
                    {isSending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                    Send
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : isLoading ? (
          /* Skeleton thread while conversations load */
          <div className="flex-1 px-4 py-4 flex flex-col gap-5 overflow-hidden animate-pulse">
            {/* Skeleton header strip */}
            <div className="flex items-center gap-3 pb-3 border-b border-white/5">
              <div className="h-9 w-9 rounded-full bg-white/8 shrink-0" />
              <div className="space-y-1.5 flex-1">
                <div className="h-3 rounded-full bg-white/8 w-36" />
                <div className="h-2 rounded-full bg-white/8 w-24" />
              </div>
            </div>
            {/* Skeleton messages — alternating guest/host */}
            {[
              { side: "left",  w: "w-52", h: "h-16" },
              { side: "right", w: "w-44", h: "h-10" },
              { side: "left",  w: "w-64", h: "h-20" },
              { side: "right", w: "w-40", h: "h-12" },
              { side: "left",  w: "w-48", h: "h-14" },
            ].map(({ side, w, h }, i) => (
              <div key={i} className={cn("flex gap-2.5", side === "right" && "flex-row-reverse")}>
                <div className="h-7 w-7 rounded-full bg-white/8 shrink-0" />
                <div className={cn("flex flex-col gap-1", side === "right" ? "items-end" : "items-start")}>
                  <div className={cn("rounded-2xl bg-white/8", w, h)} />
                  <div className="h-2 rounded-full bg-white/8 w-14" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-muted">
            <div className="text-center gap-2">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Select a conversation</p>
            </div>
          </div>
        )}
      </div>

      {/* Panel 3: Guest Profile — skeleton while loading, real content when conv available */}
      {isSidebarCollapsed ? (
        <div className="w-10 shrink-0 flex flex-col bg-surface-1 border-l border-border-default items-center py-4 gap-6 select-none transition-all duration-300">
           <Tooltip>
             <TooltipTrigger asChild>
               <button 
                 onClick={() => setIsSidebarCollapsed(false)}
                 className="p-1.5 rounded-lg bg-surface-2 border border-border-default hover:bg-surface-3 text-text-muted transition-colors shadow-sm"
               >
                 <PanelRightOpen className="h-4 w-4" />
               </button>
             </TooltipTrigger>
             <TooltipContent side="left"><p className="text-xs">Expand Profile</p></TooltipContent>
           </Tooltip>
           <div className="[writing-mode:vertical-lr] rotate-180 text-[10px] font-bold text-text-disabled uppercase tracking-[0.2em] flex items-center gap-2">
             Guest Profile
           </div>
        </div>
      ) : isLoading && !conv ? (
        <div className="w-64 shrink-0 flex flex-col bg-surface-1 overflow-y-auto animate-pulse relative border-l border-border-default">
          <button 
            onClick={() => setIsSidebarCollapsed(true)}
            className="absolute top-3 right-3 p-1.5 rounded-lg bg-white/5 border border-white/10 text-white/40 hover:bg-white/10 z-10"
          >
            <PanelRightClose className="h-3.5 w-3.5" />
          </button>
          <div className="px-4 pt-4 pb-3 border-b border-border-default">
            <div className="flex flex-col items-center gap-2">
              <div className="h-12 w-12 rounded-full bg-white/8" />
              <div className="h-3 rounded-full bg-white/8 w-28" />
              <div className="h-2 rounded-full bg-white/8 w-16" />
            </div>
          </div>
          <div className="px-4 py-3 flex flex-col gap-4">
            <div className="h-2 rounded-full bg-white/8 w-16" />
            {[80, 60, 90, 50, 70].map((w, i) => (
              <div key={i} className="h-2.5 rounded-full bg-white/8" style={{ width: `${w}%` }} />
            ))}
            <div className="h-16 rounded-lg bg-white/8 w-full mt-2" />
          </div>
        </div>
      ) : conv && !isSidebarCollapsed ? (
        <div className="w-64 shrink-0 flex flex-col bg-surface-1 overflow-y-auto relative border-l border-border-default">
          <button 
            onClick={() => setIsSidebarCollapsed(true)}
            className="absolute top-4 right-4 p-1.5 rounded-lg bg-surface-2 border border-border-default hover:bg-surface-3 text-text-muted z-10 transition-colors"
            title="Collapse Profile"
          >
            <PanelRightClose className="h-3.5 w-3.5" />
          </button>
          <div className="px-4 pt-4 pb-3 border-b border-border-default">
            <div className="flex flex-col items-center text-center gap-2">
              <div className={cn("h-12 w-12 rounded-full flex items-center justify-center text-lg font-bold", conv.avatarColor)}>
                {conv.guestInitials}
              </div>
              <div>
                <p className="text-sm font-bold text-text-primary">{conv.guestName}</p>
                <div className="flex items-center justify-center gap-1 mt-0.5">
                  {conv.rating && (
                    <><Star className="h-2.5 w-2.5 text-amber fill-amber" /><span className="text-[10px] text-amber font-medium">{conv.rating}.0</span></>
                  )}
                  <Badge variant="outline" className={cn("text-[9px] px-1.5 h-4 ml-1", CHANNEL_COLORS[conv.channel])}>{conv.channel}</Badge>
                </div>
              </div>
            </div>
          </div>
          <div className="px-4 py-3 flex flex-col gap-4">
            <div>
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">Booking</p>
              <div className="flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <Home className="h-3 w-3 text-amber shrink-0 mt-0.5" />
                  <span className="text-[11px] text-text-secondary leading-tight">{conv.property}</span>
                </div>
                {conv.checkIn && conv.checkOut && (
                  <>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3 w-3 text-amber shrink-0" />
                      <span className="text-[11px] text-text-secondary">{format(new Date(conv.checkIn), "d MMM")} – {format(new Date(conv.checkOut), "d MMM yyyy")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3 text-amber shrink-0" />
                      <span className="text-[11px] text-text-secondary">{differenceInDays(new Date(conv.checkOut), new Date(conv.checkIn))} nights</span>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">Sentiment</p>
              <div className={cn("flex items-center gap-1.5 text-[11px] font-medium", SENTIMENT_CONFIG[conv.sentiment].color)}>
                <span className="h-2 w-2 rounded-full bg-current" />
                {SENTIMENT_CONFIG[conv.sentiment].label}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">AI Insights</p>
              <div className="rounded-lg border border-border-default bg-surface-2 p-2.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Sparkles className="h-3 w-3 text-amber shrink-0" />
                  <span className="text-[10px] font-semibold text-amber">Context</span>
                </div>
                <p className="text-[10px] text-text-muted leading-relaxed">
                  {conv.sentiment === "negative"
                    ? "Guest reported an issue. Priority response recommended to protect review score."
                    : conv.sentiment === "positive"
                    ? "Guest is satisfied. Good time to upsell mid-stay add-ons or early checkout."
                    : "Pre-arrival enquiry. Confirm logistics to improve check-in experience."}
                </p>
              </div>
            </div>
            {/* Conversation Summary */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Summary</p>
                <div className="flex items-center gap-3">
                  {summary && !isGeneratingSummary && (
                    <button
                      onClick={generateSummary}
                      className="flex items-center gap-1 text-[9px] font-medium text-text-muted hover:text-amber transition-colors"
                    >
                      <RefreshCw className="h-2.5 w-2.5" />
                      Regenerate
                    </button>
                  )}
                  <button
                    onClick={() => summary ? setShowSummary((v) => !v) : generateSummary()}
                    disabled={isGeneratingSummary}
                    className="flex items-center gap-1 text-[9px] font-medium text-amber hover:text-amber/80 transition-colors disabled:opacity-50"
                  >
                    {isGeneratingSummary ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    ) : summary ? (
                      showSummary ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />
                    ) : (
                      <FileText className="h-2.5 w-2.5" />
                    )}
                    {isGeneratingSummary ? "Generating…" : summary ? (showSummary ? "Hide" : "Show") : "Generate"}
                  </button>
                </div>
              </div>
              {showSummary && summary && (
                <div className="rounded-lg border border-border-default bg-surface-2 p-2.5 flex flex-col gap-2">
                  {summary.sentimentScore != null && (
                    <div className="flex flex-col gap-2.5 mb-1">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] text-text-muted uppercase tracking-wider">Sentiment Score</span>
                          <span className={cn("text-[10px] font-bold", 
                            summary.sentimentScore > 66 ? "text-emerald-400" : summary.sentimentScore > 33 ? "text-amber" : "text-rose-400"
                          )}>
                            {summary.sentimentScore}%
                          </span>
                        </div>
                        <div className="h-1 w-full bg-surface-1 rounded-full overflow-hidden">
                          <div 
                            className={cn("h-full transition-all duration-1000", 
                              summary.sentimentScore > 66 ? "bg-emerald-400" : summary.sentimentScore > 33 ? "bg-amber" : "bg-rose-400"
                            )}
                            style={{ width: `${summary.sentimentScore}%` }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] text-text-muted uppercase tracking-wider">AI Confidence</span>
                          <span className="text-[10px] font-bold text-text-secondary">{summary.confidence}%</span>
                        </div>
                        <div className="h-1 w-full bg-surface-1 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-blue-500/80 transition-all duration-1000"
                            style={{ width: `${summary.confidence}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {Array.isArray(summary.themes) && summary.themes.length > 0 && (
                    <div>
                      <p className="text-[9px] text-text-muted mb-1 uppercase tracking-wider">Themes</p>
                      <div className="flex flex-wrap gap-1">
                        {(summary.themes as string[]).map((t) => (
                          <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full bg-surface-1 border border-border-default text-text-secondary">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Action Items */}
                  {Array.isArray(summary.actionItems) && summary.actionItems.length > 0 && (
                    <div className="mt-1">
                      <p className="text-[9px] text-text-muted mb-1 uppercase tracking-wider">Action Items</p>
                      <ul className="flex flex-col gap-1.5">
                        {summary.actionItems.map((item, i) => (
                          <li key={i} className="flex gap-1.5 items-start">
                            <span className="h-1 w-1 rounded-full bg-amber shrink-0 mt-1" />
                            <span className="text-[10px] text-text-secondary leading-tight">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Highlights (Bullet Points) */}
                  {Array.isArray(summary.bulletPoints) && summary.bulletPoints.length > 0 && (
                    <div className="mt-1">
                      <p className="text-[9px] text-text-muted mb-1 uppercase tracking-wider">Highlights</p>
                      <ul className="flex flex-col gap-1.5">
                        {summary.bulletPoints.map((bp, i) => (
                          <li key={i} className="bg-surface-1/40 p-2 rounded-md border border-border-default/20">
                            <span className="text-[10px] text-text-primary leading-relaxed">{bp}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="mt-1 pt-1.5 border-t border-border-default/30">
                    <p className="text-[9px] text-text-disabled italic">
                      {summary.totalConversations || 1} convs · {summary.needsReplyCount || 0} need reply
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div>
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">Status</p>
              <div className="flex flex-col gap-1.5">
                {(["active", "resolved"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setConversations((prev) => prev.map((c) => c.id === conv.id ? { ...c, status: s } : c))}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium border transition-colors capitalize",
                      conv.status === s
                        ? s === "resolved" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                        : "bg-amber/10 border-amber/20 text-amber"
                        : "border-border-default text-text-muted hover:text-text-secondary hover:bg-surface-2"
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", conv.status === s ? s === "resolved" ? "bg-emerald-400" : "bg-amber" : "bg-current opacity-30")} />
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Linked Tickets */}
            <div>
              <div className="flex items-center justify-between mb-2 mt-4">
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Tickets</p>
                <Badge variant="outline" className="h-4 px-1.5 text-[9px] font-bold border-border-default text-text-tertiary">
                  {isLoadingTickets ? "..." : tickets.length}
                </Badge>
              </div>
              
              <div className="flex flex-col gap-2">
                {isLoadingTickets ? (
                  <div className="flex items-center gap-2 px-2 py-3 bg-surface-2/50 rounded-lg border border-dashed border-border-default">
                    <Loader2 className="h-3 w-3 animate-spin text-text-disabled" />
                    <span className="text-[10px] text-text-disabled">Checking for tickets...</span>
                  </div>
                ) : tickets.length > 0 ? (
                  tickets.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleTicketClick(t.id)}
                      className="flex flex-col gap-1.5 px-3 py-2.5 rounded-xl text-[10px] border border-border-default bg-surface-2 hover:bg-surface-3 hover:border-amber/30 transition-all text-left group shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Wrench className="h-2.5 w-2.5 text-text-tertiary" />
                          <Badge variant="outline" className={cn("text-[8px] h-3.5 px-1 font-bold uppercase tracking-tighter", 
                            t.severity === "critical" ? "text-red-400 border-red-500/20 bg-red-500/5" : 
                            t.severity === "high" ? "text-orange-400 border-orange-500/20 bg-orange-500/5" : 
                            "text-blue-400 border-blue-500/20 bg-blue-500/5"
                          )}>
                            {t.severity}
                          </Badge>
                        </div>
                        <span className={cn("text-[8px] font-bold uppercase px-1 rounded-sm", 
                          t.status === "resolved" ? "text-emerald-400" : "text-amber"
                        )}>
                          {t.status}
                        </span>
                      </div>
                      <p className="text-[10px] text-text-secondary leading-snug line-clamp-2 group-hover:text-text-primary transition-colors">
                        {t.description}
                      </p>
                      <div className="flex items-center gap-1 text-[8px] text-text-disabled mt-0.5">
                        <ExternalLink className="h-2 w-2" />
                        <span>View in Operations Tower</span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-4 rounded-xl border border-dashed border-border-default bg-surface-2/30 text-center">
                    <p className="text-[10px] text-text-disabled italic">No tickets raised for this guest</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </TooltipProvider>
  </>
);
}

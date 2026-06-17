"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Search,
  Filter,
  Send,
  Sparkles,
  Bot,
  User,
  Home,
  Calendar,
  Star,
  Phone,
  Mail,
  MessageCircle,
  Clock,
  CheckCheck,
  ChevronDown,
  Tag,
  Globe,
  RefreshCcw,
  ThumbsUp,
  ThumbsDown,
  X,
  Airplay,
} from "lucide-react";
import { format, addDays } from "date-fns";

// ── Mock Data ────────────────────────────────────────────────────────────────

type Sentiment = "positive" | "neutral" | "negative";
type Channel = "Airbnb" | "Booking.com" | "Direct" | "Vrbo";

type Conversation = {
  id: string;
  guestName: string;
  guestInitials: string;
  avatarColor: string;
  channel: Channel;
  property: string;
  checkIn: string;
  checkOut: string;
  lastMessage: string;
  lastTime: string;
  unread: number;
  sentiment: Sentiment;
  rating: number | null;
  status: "active" | "resolved" | "pending";
};

type Message = {
  id: string;
  role: "guest" | "host";
  content: string;
  time: string;
  isAI?: boolean;
};

const CONVERSATIONS: Conversation[] = [
  {
    id: "c1",
    guestName: "Sarah Mitchell",
    guestInitials: "SM",
    avatarColor: "bg-blue-500/20 text-blue-400",
    channel: "Airbnb",
    property: "Marina Heights 1BR",
    checkIn: "2026-04-28",
    checkOut: "2026-05-03",
    lastMessage: "Is early check-in at 11am possible?",
    lastTime: "9 min ago",
    unread: 2,
    sentiment: "neutral",
    rating: null,
    status: "active",
  },
  {
    id: "c2",
    guestName: "Ahmed Al-Rashid",
    guestInitials: "AA",
    avatarColor: "bg-emerald-500/20 text-emerald-400",
    channel: "Booking.com",
    property: "Downtown Residences 2BR",
    checkIn: "2026-04-30",
    checkOut: "2026-05-07",
    lastMessage: "Thank you, everything looks perfect!",
    lastTime: "1h ago",
    unread: 0,
    sentiment: "positive",
    rating: 5,
    status: "resolved",
  },
  {
    id: "c3",
    guestName: "Julia Schneider",
    guestInitials: "JS",
    avatarColor: "bg-purple-500/20 text-purple-400",
    channel: "Direct",
    property: "JBR Beach Studio",
    checkIn: "2026-05-01",
    checkOut: "2026-05-05",
    lastMessage: "The AC isn't working properly, can someone…",
    lastTime: "2h ago",
    unread: 1,
    sentiment: "negative",
    rating: null,
    status: "active",
  },
  {
    id: "c4",
    guestName: "Michael Torres",
    guestInitials: "MT",
    avatarColor: "bg-amber/20 text-amber",
    channel: "Vrbo",
    property: "Palm Villa 3BR",
    checkIn: "2026-05-10",
    checkOut: "2026-05-17",
    lastMessage: "Looking forward to our stay! Quick question…",
    lastTime: "4h ago",
    unread: 1,
    sentiment: "positive",
    rating: null,
    status: "pending",
  },
];

const MESSAGES: Record<string, Message[]> = {
  c1: [
    {
      id: "m1",
      role: "host",
      content: "Hi Sarah! Excited to welcome you to Marina Heights. Your booking is confirmed for Apr 28 – May 3.",
      time: "Apr 24, 10:00",
    },
    {
      id: "m2",
      role: "guest",
      content: "Thank you! I have a question - is early check-in at 11am possible? We have an early flight.",
      time: "Apr 25, 09:16",
    },
  ],
  c3: [
    {
      id: "m1",
      role: "host",
      content: "Hi Julia! Welcome to JBR Beach Studio. Let me know if you need anything during your stay.",
      time: "May 1, 15:00",
    },
    {
      id: "m2",
      role: "guest",
      content: "The AC isn't working properly, can someone come and fix it? It's getting really warm.",
      time: "May 1, 18:30",
    },
  ],
};

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

const AI_DRAFTS: Record<string, string> = {
  c1: "Hi Sarah! Absolutely, I can arrange early check-in at 11am for you. I'll coordinate with the cleaning team to ensure the apartment is ready. I'll send you the key access details 24 hours before your arrival. Looking forward to welcoming you!",
  c3: "Hi Julia! I sincerely apologize for the inconvenience. I've already contacted our maintenance team and they'll be at the property within the hour. In the meantime, you'll find a portable fan in the hall closet. As a gesture of goodwill, I'm crediting AED 150 to your booking.",
};

// ── Sub-components ───────────────────────────────────────────────────────────

function ConversationCard({
  conv,
  selected,
  onClick,
}: {
  conv: Conversation;
  selected: boolean;
  onClick: () => void;
}) {
  const sentConf = SENTIMENT_CONFIG[conv.sentiment];

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-3 rounded-xl border transition-all",
        selected
          ? "bg-amber/8 border-amber/25"
          : "hover:bg-surface-2 border-transparent hover:border-border-default"
      )}
    >
      {/* Row 1: Avatar + Name + Time + Unread */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={cn(
              "h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0",
              conv.avatarColor
            )}
          >
            {conv.guestInitials}
          </div>
          <span className={cn("text-[12px] font-semibold truncate", selected ? "text-amber" : "text-text-primary")}>
            {conv.guestName}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[9px] text-text-muted">{conv.lastTime}</span>
          {conv.unread > 0 && (
            <span className="h-4 w-4 rounded-full bg-amber text-black text-[9px] font-bold flex items-center justify-center">
              {conv.unread}
            </span>
          )}
        </div>
      </div>

      {/* Row 2: Channel + Property */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <Badge
          variant="outline"
          className={cn("text-[9px] px-1.5 py-0 h-4 font-medium", CHANNEL_COLORS[conv.channel])}
        >
          {conv.channel}
        </Badge>
        <span className="text-[10px] text-text-muted truncate">{conv.property}</span>
      </div>

      {/* Row 3: Last message */}
      <p className="text-[10px] text-text-muted truncate">{conv.lastMessage}</p>

      {/* Row 4: Check-in + Sentiment */}
      <div className="flex items-center justify-between mt-1.5">
        <div className="flex items-center gap-1">
          <Calendar className="h-2.5 w-2.5 text-text-muted" />
          <span className="text-[9px] text-text-muted">
            {format(new Date(conv.checkIn), "d MMM")} – {format(new Date(conv.checkOut), "d MMM")}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <span className={cn("text-[9px] font-medium", sentConf.color)}>{sentConf.label}</span>
        </div>
      </div>
    </button>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function GuestInboxV2() {
  const [selected, setSelected] = useState<string>("c1");
  const [filterChannel, setFilterChannel] = useState<"all" | Channel>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "pending" | "resolved">("all");
  const [showDraft, setShowDraft] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const conv = CONVERSATIONS.find((c) => c.id === selected)!;
  const messages = MESSAGES[selected] ?? [];
  const aiDraft = AI_DRAFTS[selected];

  const filteredConversations = CONVERSATIONS.filter((c) => {
    if (filterChannel !== "all" && c.channel !== filterChannel) return false;
    if (filterStatus !== "all" && c.status !== filterStatus) return false;
    if (searchQuery && !c.guestName.toLowerCase().includes(searchQuery.toLowerCase()) && !c.property.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const handleUseDraft = () => {
    setDraftText(aiDraft ?? "");
    setShowDraft(false);
  };

  return (
    <div className="flex h-[680px] rounded-2xl overflow-hidden border border-border-default bg-surface-0 shadow-lg">
      {/* Panel 1: Conversation List */}
      <div className="w-64 shrink-0 flex flex-col border-r border-border-default bg-surface-1">
        {/* Header */}
        <div className="px-3 pt-4 pb-2">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-text-primary">Guest Inbox</span>
            <Badge variant="outline" className="text-[10px] border-amber/30 text-amber bg-amber/5">
              {CONVERSATIONS.filter((c) => c.unread > 0).length} new
            </Badge>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-border-default mb-2">
            <Search className="h-3 w-3 text-text-muted shrink-0" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search guests or properties…"
              className="bg-transparent text-[11px] text-text-primary placeholder:text-text-muted outline-none flex-1 min-w-0"
            />
          </div>

          {/* Filter pills */}
          <div className="flex gap-1 flex-wrap">
            {(["all", "active", "pending", "resolved"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={cn(
                  "text-[9px] font-medium px-2 py-0.5 rounded-full border transition-colors capitalize",
                  filterStatus === s
                    ? "bg-amber/10 border-amber/30 text-amber"
                    : "border-border-default text-text-muted hover:text-text-secondary"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <ScrollArea className="flex-1">
          <div className="px-2 flex flex-col gap-0.5 pb-2">
            {filteredConversations.map((c) => (
              <ConversationCard
                key={c.id}
                conv={c}
                selected={selected === c.id}
                onClick={() => { setSelected(c.id); setShowDraft(false); setDraftText(""); }}
              />
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Panel 2: Message Thread */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-border-default">
        {/* Thread Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default bg-surface-1 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn("h-9 w-9 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0", conv.avatarColor)}>
              {conv.guestInitials}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-text-primary">{conv.guestName}</span>
                <Badge variant="outline" className={cn("text-[9px] px-1.5 h-4", CHANNEL_COLORS[conv.channel])}>
                  {conv.channel}
                </Badge>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <Home className="h-2.5 w-2.5 text-text-muted" />
                <span className="text-[10px] text-text-muted">{conv.property}</span>
                <span className="text-[10px] text-text-muted">·</span>
                <Calendar className="h-2.5 w-2.5 text-text-muted" />
                <span className="text-[10px] text-text-muted">
                  {format(new Date(conv.checkIn), "d MMM")} – {format(new Date(conv.checkOut), "d MMM")}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowDraft((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors",
              showDraft
                ? "bg-amber text-black border-amber"
                : "border-amber/30 text-amber bg-amber/5 hover:bg-amber/10"
            )}
          >
            <Bot className="h-3 w-3" />
            AI Draft
          </button>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 px-4 py-4">
          <div className="flex flex-col gap-4">
            {messages.map((msg) => {
              const isGuest = msg.role === "guest";
              return (
                <div key={msg.id} className={cn("flex gap-2.5", isGuest ? "flex-row" : "flex-row-reverse")}>
                  <div
                    className={cn(
                      "h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold",
                      isGuest ? conv.avatarColor : "bg-amber/10 text-amber border border-amber/20"
                    )}
                  >
                    {isGuest ? conv.guestInitials : "You"}
                  </div>
                  <div className={cn("max-w-[72%] flex flex-col gap-1", isGuest ? "items-start" : "items-end")}>
                    <div
                      className={cn(
                        "rounded-2xl px-3.5 py-2.5 text-[12px] leading-relaxed",
                        isGuest
                          ? "bg-surface-2 border border-border-default text-text-primary rounded-bl-md"
                          : "bg-amber text-black rounded-br-md font-medium"
                      )}
                    >
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
          </div>
        </ScrollArea>

        {/* AI Draft Banner */}
        {showDraft && aiDraft && (
          <div className="mx-4 mb-3 rounded-xl border border-amber/25 bg-amber/5 p-3 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber" />
                <span className="text-[11px] font-semibold text-amber">AI Draft Reply</span>
              </div>
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-1 text-[10px] text-text-muted hover:text-emerald-400 transition-colors">
                  <ThumbsUp className="h-3 w-3" /> Good
                </button>
                <button className="flex items-center gap-1 text-[10px] text-text-muted hover:text-red-400 transition-colors">
                  <ThumbsDown className="h-3 w-3" /> Bad
                </button>
                <button onClick={() => setShowDraft(false)}>
                  <X className="h-3.5 w-3.5 text-text-muted hover:text-text-primary" />
                </button>
              </div>
            </div>
            <p className="text-[11px] text-text-secondary leading-relaxed mb-2">{aiDraft}</p>
            <button
              onClick={handleUseDraft}
              className="w-full py-1.5 rounded-lg bg-amber text-black text-[11px] font-semibold hover:bg-amber/90 transition-colors"
            >
              Use this draft
            </button>
          </div>
        )}

        {/* Reply Input */}
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
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowDraft(true)}
                  className="flex items-center gap-1 text-[10px] text-amber hover:text-amber/80 font-medium transition-colors"
                >
                  <Bot className="h-3 w-3" />
                  Generate AI draft
                </button>
              </div>
              <Button
                size="sm"
                disabled={!draftText.trim()}
                className="h-7 px-3 bg-amber text-black hover:bg-amber/90 text-[11px] gap-1 disabled:opacity-40"
              >
                <Send className="h-3 w-3" />
                Send
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Panel 3: Guest Profile */}
      <div className="w-56 shrink-0 flex flex-col bg-surface-1 overflow-y-auto">
        <div className="px-4 pt-4 pb-3 border-b border-border-default">
          <div className="flex flex-col items-center text-center gap-2">
            <div className={cn("h-12 w-12 rounded-full flex items-center justify-center text-lg font-bold", conv.avatarColor)}>
              {conv.guestInitials}
            </div>
            <div>
              <p className="text-sm font-bold text-text-primary">{conv.guestName}</p>
              <div className="flex items-center justify-center gap-1 mt-0.5">
                {conv.rating && (
                  <>
                    <Star className="h-2.5 w-2.5 text-amber fill-amber" />
                    <span className="text-[10px] text-amber font-medium">{conv.rating}.0</span>
                  </>
                )}
                <Badge
                  variant="outline"
                  className={cn("text-[9px] px-1.5 h-4 ml-1", CHANNEL_COLORS[conv.channel])}
                >
                  {conv.channel}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 py-3 flex flex-col gap-4">
          {/* Booking info */}
          <div>
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">Booking</p>
            <div className="flex flex-col gap-2">
              <div className="flex items-start gap-2">
                <Home className="h-3 w-3 text-amber shrink-0 mt-0.5" />
                <span className="text-[11px] text-text-secondary leading-tight">{conv.property}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-3 w-3 text-amber shrink-0" />
                <span className="text-[11px] text-text-secondary">
                  {format(new Date(conv.checkIn), "d MMM")} – {format(new Date(conv.checkOut), "d MMM yyyy")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-3 w-3 text-amber shrink-0" />
                <span className="text-[11px] text-text-secondary">
                  {Math.round((new Date(conv.checkOut).getTime() - new Date(conv.checkIn).getTime()) / (1000 * 60 * 60 * 24))} nights
                </span>
              </div>
            </div>
          </div>

          {/* Sentiment */}
          <div>
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">Sentiment</p>
            <div className={cn("flex items-center gap-1.5 text-[11px] font-medium", SENTIMENT_CONFIG[conv.sentiment].color)}>
              <span className="h-2 w-2 rounded-full bg-current" />
              {SENTIMENT_CONFIG[conv.sentiment].label}
            </div>
          </div>

          {/* AI Context */}
          <div>
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">AI Insights</p>
            <div className="rounded-lg border border-border-default bg-surface-2 p-2.5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Sparkles className="h-3 w-3 text-amber shrink-0" />
                <span className="text-[10px] font-semibold text-amber">Context</span>
              </div>
              <p className="text-[10px] text-text-muted leading-relaxed">
                {conv.sentiment === "negative"
                  ? "Guest reported a maintenance issue. Priority response recommended to protect review score."
                  : conv.sentiment === "positive"
                  ? "Guest is satisfied. Good time to upsell mid-stay add-ons or early checkout offer."
                  : "Pre-arrival enquiry. Confirm logistics to build confidence and improve check-in experience."}
              </p>
            </div>
          </div>

          {/* Status */}
          <div>
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">Status</p>
            <div className="flex flex-col gap-1.5">
              {(["active", "pending", "resolved"] as const).map((s) => (
                <button
                  key={s}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium border transition-colors capitalize",
                    conv.status === s
                      ? s === "resolved"
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                        : s === "active"
                        ? "bg-amber/10 border-amber/20 text-amber"
                        : "bg-blue-500/10 border-blue-500/20 text-blue-400"
                      : "border-border-default text-text-muted hover:text-text-secondary hover:bg-surface-2"
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      conv.status === s
                        ? s === "resolved"
                          ? "bg-emerald-400"
                          : s === "active"
                          ? "bg-amber"
                          : "bg-blue-400"
                        : "bg-current opacity-30"
                    )}
                  />
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

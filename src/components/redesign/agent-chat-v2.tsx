"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Bot,
  Send,
  Sparkles,
  ChevronRight,
  Plus,
  Search,
  TrendingUp,
  Calendar,
  DollarSign,
  BarChart3,
  Zap,
  CheckCircle2,
  Clock,
  Activity,
  MessageSquare,
  X,
  ChevronDown,
} from "lucide-react";
import { format } from "date-fns";

// ── Mock Data ────────────────────────────────────────────────────────────────

const THREADS = [
  {
    id: "t1",
    title: "Weekend pricing strategy",
    preview: "Increase rates by 18% for Fri–Sat across JBR units",
    time: "2h ago",
    messageCount: 7,
    active: true,
  },
  {
    id: "t2",
    title: "Dubai Expo gap fill",
    preview: "Gap fill discount applied to 3 properties",
    time: "Yesterday",
    messageCount: 4,
    active: false,
  },
  {
    id: "t3",
    title: "Palm Jumeirah occupancy drop",
    preview: "Last-minute discount recommended for next 5 days",
    time: "2d ago",
    messageCount: 12,
    active: false,
  },
  {
    id: "t4",
    title: "Q2 revenue forecast",
    preview: "Based on current bookings, Q2 projects +14% YoY",
    time: "3d ago",
    messageCount: 5,
    active: false,
  },
  {
    id: "t5",
    title: "Ramadan pricing rules",
    preview: "Season rule: -8% during first two weeks",
    time: "5d ago",
    messageCount: 9,
    active: false,
  },
];

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: string;
  actions?: { label: string; variant: "primary" | "ghost" }[];
  graph?: { label: string; pct: number; color: string }[];
};

const INITIAL_MESSAGES: Message[] = [
  {
    id: "m1",
    role: "assistant",
    content:
      "Good morning. I've scanned your portfolio and spotted 3 revenue opportunities for this weekend. JBR unit occupancy is trending 22% above last weekend - I'd recommend a Friday rate increase across those listings.",
    time: "09:14",
    actions: [
      { label: "Review proposals", variant: "primary" },
      { label: "Tell me more", variant: "ghost" },
    ],
  },
  {
    id: "m2",
    role: "user",
    content: "What's driving the JBR demand spike?",
    time: "09:16",
  },
  {
    id: "m3",
    role: "assistant",
    content:
      "Two signals: (1) a major tech conference at DWTC starts Thursday with ~12K attendees, and (2) competitor JBR listings are already 74% booked for Friday. Demand is front-loading. I can push a 15–20% uplift for Fri–Sun across your 4 JBR units.",
    time: "09:16",
    graph: [
      { label: "Conference demand", pct: 78, color: "bg-amber" },
      { label: "Competitor availability", pct: 26, color: "bg-blue-500" },
      { label: "Your availability", pct: 62, color: "bg-emerald-500" },
    ],
    actions: [
      { label: "Apply +18% to JBR", variant: "primary" },
      { label: "Adjust percentage", variant: "ghost" },
    ],
  },
];

const SUGGESTED_PROMPTS = [
  { icon: TrendingUp, text: "Show this week's pricing opportunities" },
  { icon: Calendar, text: "What events affect next 30 days?" },
  { icon: DollarSign, text: "Which properties need rate adjustments?" },
  { icon: BarChart3, text: "Generate Q2 revenue forecast" },
];

// ── Inference Step Display ───────────────────────────────────────────────────

const INFERENCE_STEPS = [
  { id: "router", label: "Router" },
  { id: "market", label: "Market Intel" },
  { id: "pricing", label: "Pricing Guard" },
  { id: "response", label: "Response" },
];

function InferenceFlow({ active }: { active: boolean }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!active) { setStep(0); return; }
    const t = setInterval(() => setStep(s => Math.min(s + 1, INFERENCE_STEPS.length - 1)), 600);
    return () => clearInterval(t);
  }, [active]);

  return (
    <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-1 border border-border-default">
      <Zap className="h-3 w-3 text-amber shrink-0" />
      <div className="flex items-center gap-1">
        {INFERENCE_STEPS.map((s, i) => (
          <span key={s.id} className="flex items-center gap-1">
            <span
              className={cn(
                "text-[10px] font-medium transition-colors",
                i < step ? "text-emerald-400" : i === step ? "text-amber" : "text-text-muted"
              )}
            >
              {i < step ? <CheckCircle2 className="inline h-3 w-3 mr-0.5" /> : null}
              {s.label}
            </span>
            {i < INFERENCE_STEPS.length - 1 && (
              <ChevronRight className="h-2.5 w-2.5 text-text-muted" />
            )}
          </span>
        ))}
      </div>
      {active && step < INFERENCE_STEPS.length - 1 && (
        <Activity className="h-3 w-3 text-amber ml-1 animate-pulse" />
      )}
    </div>
  );
}

// ── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      {!isUser && (
        <div className="shrink-0 h-8 w-8 rounded-full bg-amber/10 border border-amber/20 flex items-center justify-center">
          <Bot className="h-4 w-4 text-amber" />
        </div>
      )}
      <div className={cn("max-w-[76%] flex flex-col gap-2", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-sm leading-relaxed",
            isUser
              ? "bg-amber text-black rounded-br-md font-medium"
              : "bg-surface-2 text-text-primary border border-border-default rounded-bl-md"
          )}
        >
          {msg.content}
        </div>

        {msg.graph && (
          <div className="w-full rounded-xl border border-border-default bg-surface-1 p-3 flex flex-col gap-2">
            {msg.graph.map((g) => (
              <div key={g.label} className="flex items-center gap-2">
                <span className="text-[10px] text-text-muted w-36 shrink-0">{g.label}</span>
                <div className="flex-1 h-1.5 rounded-full bg-surface-3">
                  <div
                    className={cn("h-1.5 rounded-full transition-all", g.color)}
                    style={{ width: `${g.pct}%` }}
                  />
                </div>
                <span className="text-[10px] font-semibold text-text-secondary w-7 text-right">{g.pct}%</span>
              </div>
            ))}
          </div>
        )}

        {msg.actions && (
          <div className="flex gap-2 flex-wrap">
            {msg.actions.map((a) => (
              <button
                key={a.label}
                className={cn(
                  "text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors",
                  a.variant === "primary"
                    ? "bg-amber text-black border-amber hover:bg-amber/90"
                    : "bg-surface-1 text-text-secondary border-border-default hover:bg-surface-2 hover:text-text-primary"
                )}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}

        <span className="text-[10px] text-text-muted">{msg.time}</span>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function AgentChatV2() {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showInference, setShowInference] = useState(false);
  const [selectedThread, setSelectedThread] = useState("t1");
  const [showSuggested, setShowSuggested] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;

    const userMsg: Message = {
      id: `m${Date.now()}`,
      role: "user",
      content: text,
      time: format(new Date(), "HH:mm"),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);
    setShowInference(true);

    setTimeout(() => {
      setIsTyping(false);
      setShowInference(false);
      const reply: Message = {
        id: `m${Date.now() + 1}`,
        role: "assistant",
        content: `Analyzing your request across ${Math.floor(Math.random() * 5) + 3} data sources. Based on current market conditions, I've identified the most relevant pricing action for your portfolio. Would you like me to generate a detailed proposal?`,
        time: format(new Date(), "HH:mm"),
        actions: [
          { label: "Generate proposal", variant: "primary" },
          { label: "Show breakdown", variant: "ghost" },
        ],
      };
      setMessages((prev) => [...prev, reply]);
    }, 2400);
  };

  return (
    <div className="flex h-[680px] rounded-2xl overflow-hidden border border-border-default bg-surface-0 shadow-lg">
      {/* Left: Thread History Sidebar */}
      <div className="w-60 shrink-0 flex flex-col border-r border-border-default bg-surface-1">
        <div className="px-3 pt-4 pb-3 flex items-center justify-between">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Conversations</span>
          <button className="h-6 w-6 rounded-md bg-amber/10 border border-amber/20 flex items-center justify-center hover:bg-amber/20 transition-colors">
            <Plus className="h-3.5 w-3.5 text-amber" />
          </button>
        </div>

        <div className="px-3 pb-2">
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-border-default">
            <Search className="h-3 w-3 text-text-muted shrink-0" />
            <span className="text-[11px] text-text-muted">Search conversations…</span>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="px-2 flex flex-col gap-0.5">
            {THREADS.map((thread) => (
              <button
                key={thread.id}
                onClick={() => setSelectedThread(thread.id)}
                className={cn(
                  "w-full text-left px-2.5 py-2.5 rounded-xl transition-colors",
                  selectedThread === thread.id
                    ? "bg-amber/10 border border-amber/20"
                    : "hover:bg-surface-2 border border-transparent"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={cn(
                      "text-[11px] font-semibold truncate max-w-[120px]",
                      selectedThread === thread.id ? "text-amber" : "text-text-primary"
                    )}
                  >
                    {thread.title}
                  </span>
                  <span className="text-[9px] text-text-muted shrink-0">{thread.time}</span>
                </div>
                <span className="text-[10px] text-text-muted leading-tight line-clamp-2">{thread.preview}</span>
                <div className="flex items-center gap-1 mt-1.5">
                  <MessageSquare className="h-2.5 w-2.5 text-text-muted" />
                  <span className="text-[9px] text-text-muted">{thread.messageCount} msgs</span>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Right: Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default bg-surface-1 shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="h-8 w-8 rounded-full bg-amber/10 border border-amber/20 flex items-center justify-center">
                <Bot className="h-4 w-4 text-amber" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-surface-1" />
            </div>
            <div>
              <span className="text-sm font-semibold text-text-primary">PriceOS CRO Agent</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span className="text-[10px] text-emerald-400 font-medium">Active · Monitoring 12 properties</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] border-amber/30 text-amber bg-amber/5 gap-1">
              <Sparkles className="h-2.5 w-2.5" />
              AI Mode
            </Badge>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 px-4 py-4">
          <div className="flex flex-col gap-5">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}

            {isTyping && (
              <div className="flex gap-3">
                <div className="h-8 w-8 rounded-full bg-amber/10 border border-amber/20 flex items-center justify-center shrink-0">
                  <Bot className="h-4 w-4 text-amber" />
                </div>
                <div className="flex flex-col gap-2 items-start">
                  <div className="rounded-2xl rounded-bl-md bg-surface-2 border border-border-default px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber animate-bounce [animation-delay:0ms]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-amber animate-bounce [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-amber animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                  {showInference && <InferenceFlow active={isTyping} />}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        {/* Suggested Prompts Toggle */}
        {!isTyping && messages.length <= INITIAL_MESSAGES.length + 1 && (
          <div className="px-4 pb-2 shrink-0">
            <button
              onClick={() => setShowSuggested((v) => !v)}
              className="flex items-center gap-1.5 text-[11px] text-text-muted hover:text-text-secondary transition-colors"
            >
              <Sparkles className="h-3 w-3 text-amber" />
              Suggested prompts
              <ChevronDown className={cn("h-3 w-3 transition-transform", showSuggested && "rotate-180")} />
            </button>
            {showSuggested && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {SUGGESTED_PROMPTS.map(({ icon: Icon, text }) => (
                  <button
                    key={text}
                    onClick={() => { setInput(text); setShowSuggested(false); }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border-default bg-surface-1 text-[11px] text-text-secondary hover:bg-surface-2 hover:text-text-primary hover:border-amber/30 transition-colors"
                  >
                    <Icon className="h-3 w-3 text-amber shrink-0" />
                    {text}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Input */}
        <div className="px-4 pb-4 shrink-0">
          <div className="flex items-end gap-2 rounded-xl border border-border-default bg-surface-1 px-3 py-2 focus-within:border-amber/40 transition-colors">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask about pricing, occupancy, revenue…"
              className="flex-1 min-h-[36px] max-h-28 resize-none border-0 bg-transparent p-0 text-sm text-text-primary placeholder:text-text-muted focus-visible:ring-0 focus-visible:ring-offset-0"
              rows={1}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isTyping}
              size="sm"
              className="h-8 w-8 p-0 bg-amber text-black hover:bg-amber/90 rounded-lg shrink-0 disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-[9px] text-text-muted mt-1.5 text-center">
            PriceOS CRO · Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}

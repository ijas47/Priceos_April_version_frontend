"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Send, Loader2,
  PanelRightClose, PanelRightOpen, Building2, MessageSquarePlus,
} from "lucide-react";
import {
  IconCircleCheck,
} from "@tabler/icons-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Custom markdown renderer — handles tables, headings, lists, code without @tailwindcss/typography
function MarkdownMessage({ content, isUser }: { content: string; isUser: boolean }) {
  const mutedText = isUser ? "text-primary-foreground/70" : "text-muted-foreground";
  const baseText = isUser ? "text-primary-foreground" : "text-foreground/90";

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Tables
        table: ({ children }) => (
          <div className="overflow-x-auto my-3 rounded-lg border border-border/40">
            <table className="w-full text-xs border-collapse">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-muted/50 text-muted-foreground uppercase tracking-wider text-[10px]">{children}</thead>
        ),
        tbody: ({ children }) => <tbody className="divide-y divide-border/30">{children}</tbody>,
        tr: ({ children }) => <tr className="hover:bg-muted/20 transition-colors">{children}</tr>,
        th: ({ children }) => (
          <th className="px-3 py-2 text-left font-black whitespace-nowrap">{children}</th>
        ),
        td: ({ children }) => <td className="px-3 py-2 whitespace-nowrap">{children}</td>,
        // Headings
        h1: ({ children }) => <h1 className={`text-base font-black mt-3 mb-1 ${baseText}`}>{children}</h1>,
        h2: ({ children }) => <h2 className={`text-sm font-black mt-3 mb-1 ${baseText}`}>{children}</h2>,
        h3: ({ children }) => <h3 className={`text-xs font-black uppercase tracking-wider mt-3 mb-1 ${mutedText}`}>{children}</h3>,
        // Inline
        strong: ({ children }) => <strong className={`font-black ${baseText}`}>{children}</strong>,
        em: ({ children }) => <em className="italic opacity-80">{children}</em>,
        // Paragraphs & lists
        p: ({ children }) => <p className={`text-sm leading-relaxed mb-2 last:mb-0 ${baseText}`}>{children}</p>,
        ul: ({ children }) => <ul className={`list-disc pl-4 mb-2 space-y-0.5 text-sm ${baseText}`}>{children}</ul>,
        ol: ({ children }) => <ol className={`list-decimal pl-4 mb-2 space-y-0.5 text-sm ${baseText}`}>{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        // Code
        code: ({ children, className }) => {
          const isBlock = className?.includes("language-");
          return isBlock
            ? <pre className="bg-muted/40 rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono border border-border/30"><code>{children}</code></pre>
            : <code className="bg-muted/40 px-1.5 py-0.5 rounded text-[11px] font-mono border border-border/20">{children}</code>;
        },
        // Blockquote
        blockquote: ({ children }) => (
          <blockquote className={`border-l-2 border-primary/40 pl-3 my-2 ${mutedText} italic text-sm`}>{children}</blockquote>
        ),
        // Horizontal rule
        hr: () => <hr className="border-border/30 my-3" />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

import { useContextStore } from "@/stores/context-store";
import type { PropertyWithMetrics } from "@/types";
import { DateRangePicker } from "./date-range-picker";
import { addDays, differenceInCalendarDays, format, startOfDay } from "date-fns";
import { Tooltip, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { toast } from "sonner";
import { resolveChatResponse } from "@/lib/api/poll-job";
import { normalizeChatAgentOutput, hydrateAssistantMessage } from "@/lib/chat/normalize-agent-response";
import { buildBaseScopeId, generateThreadSessionId } from "@/lib/chat/agent-session-id";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** One-click starters shown in the empty chat state to reduce blank-page friction. */
const SUGGESTED_PROMPTS = [
  "How should I price this for better occupancy?",
  "Find gap nights worth discounting",
  "What events could move demand this period?",
  "Give me a full pricing analysis",
];

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  proposals?: any[];
  proposalStatus?: "pending" | "saved" | "rejected";
  // per-proposal approve/reject decisions keyed by proposal_id
  proposalDecisions?: Record<string, "approved" | "rejected">;
  metadata?: any;
}

interface ChatSessionRow {
  sessionId: string;
  lastMessageAt: string;
  messageCount: number;
}

interface Props {
  properties: PropertyWithMetrics[];
  orgId: string;
}

// Pricing Agent Interface

// Focused Pricing Agent Interface

export function UnifiedChatInterface({ properties: _properties, orgId }: Props) {
  const {
    contextType,
    propertyId,
    propertyName,
    isSidebarOpen,
    toggleSidebar,
    dateRange,
    setDateRange,
    triggerMarketRefresh,
    setCalendarMetrics: setGlobalMetrics,
  } = useContextStore();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [isChatActive, setIsChatActive] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [sessionId, setSessionId] = useState<string>("");

  // Sync sessionId with context
  useEffect(() => {
    const newId = buildBaseScopeId(
      propertyId || undefined,
      dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : "start",
      dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : "end"
    );
    setSessionId(newId);
  }, [propertyId, dateRange]);


  /** After "Run Aria" succeeds, history may still be empty — async /api/chat/history must not flip chat back to OFFLINE. */
  const ariaReadyScopeRef = useRef<string | null>(null);
  const scopeKeyRef = useRef<{ propertyId?: string; from?: number; to?: number }>({});

  const ARIA_READY_STORAGE_PREFIX = "priceos-aria-chat-ready:";
  const THREAD_PREF_STORAGE_PREFIX = "priceos-agent-thread:";

  const readAriaReadyFromStorage = useCallback((sessionKey: string) => {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem(`${ARIA_READY_STORAGE_PREFIX}${sessionKey}`) === "1";
    } catch {
      return false;
    }
  }, []);

  const writeAriaReadyToStorage = useCallback((sessionKey: string) => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(`${ARIA_READY_STORAGE_PREFIX}${sessionKey}`, "1");
    } catch {
      /* quota / private mode */
    }
  }, []);

  const readThreadPref = useCallback((baseScopeId: string): string => {
    if (typeof window === "undefined") return "";
    try {
      return sessionStorage.getItem(`${THREAD_PREF_STORAGE_PREFIX}${baseScopeId}`) || "";
    } catch {
      return "";
    }
  }, []);

  const writeThreadPref = useCallback((baseScopeId: string, threadSessionId: string) => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(`${THREAD_PREF_STORAGE_PREFIX}${baseScopeId}`, threadSessionId);
    } catch {
      /* quota / private mode */
    }
  }, []);

  const loadThreadMessages = useCallback(
    async (threadSessionId: string): Promise<number> => {
      const propParam = contextType === "property" && propertyId ? propertyId : "null";
      const res = await fetch(
        `/api/chat/history?propertyId=${propParam}&sessionId=${encodeURIComponent(threadSessionId)}&orgId=${encodeURIComponent(orgId)}`
      );
      if (res.ok) {
        const data = await res.json();
        const list = data.messages || [];
        if (list.length > 0) {
          setMessages(list.map((m: Message) => hydrateAssistantMessage(m)));
          return list.length;
        }
        setMessages([]);
        return 0;
      }
      setMessages([]);
      return 0;
    },
    [contextType, propertyId]
  );

  const isAriaReadyForScope = useCallback(
    (baseScopeId: string) =>
      ariaReadyScopeRef.current === baseScopeId ||
      readAriaReadyFromStorage(baseScopeId),
    [readAriaReadyFromStorage]
  );



  const [chatSessions, setChatSessions] = useState<ChatSessionRow[]>([]);

  const sessionSelectOptions = useMemo(() => {
    const map = new Map<string, ChatSessionRow>();
    for (const s of chatSessions) {
      map.set(s.sessionId, s);
    }
    if (sessionId && !map.has(sessionId)) {
      map.set(sessionId, {
        sessionId,
        lastMessageAt: new Date().toISOString(),
        messageCount: 0,
      });
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    );
  }, [chatSessions, sessionId]);

  useEffect(() => {
    const today = startOfDay(new Date());
    const maxTo = addDays(today, 30);

    if (!dateRange?.from || !dateRange?.to) {
      setDateRange({ from: today, to: maxTo });
      return;
    }

    const from = startOfDay(dateRange.from);
    const to = startOfDay(dateRange.to);
    const spanDays = differenceInCalendarDays(to, from);
    const needsClamp = from < today || to > maxTo || spanDays > 30 || to < from;

    if (needsClamp) {
      const safeFrom = from < today ? today : from;
      const safeToCandidate = to > maxTo ? maxTo : to;
      const safeTo =
        safeToCandidate < safeFrom
          ? safeFrom
          : differenceInCalendarDays(safeToCandidate, safeFrom) > 30
            ? addDays(safeFrom, 30)
            : safeToCandidate;
      setDateRange({ from: safeFrom, to: safeTo });
    }
  }, [dateRange?.from?.getTime(), dateRange?.to?.getTime(), setDateRange]);
  const [isSettingUp, setIsSettingUp] = useState(false);

  // Fetching helper removed since it's now in GuestChatInterface

  // Dynamic calendar metrics (occupancy + avg price for selected date range)
  const [calendarMetrics, setCalendarMetrics] = useState<any | null>(null);

  // 1. Session Initialization & Hydration
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const fromT = dateRange?.from?.getTime();
    const toT = dateRange?.to?.getTime();
    const prev = scopeKeyRef.current;
    if (prev.propertyId !== propertyId || prev.from !== fromT || prev.to !== toT) {
      ariaReadyScopeRef.current = null;
      scopeKeyRef.current = { propertyId: propertyId ?? undefined, from: fromT, to: toT };
    }

    const fromStr = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : "start";
    const toStr = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : "end";
    const baseScopeId = buildBaseScopeId(
      contextType === "property" && propertyId ? propertyId : undefined,
      fromStr,
      toStr
    );

    const fetchHistory = async () => {
      setIsHistoryLoading(true);
      try {
        const propParam = contextType === "property" && propertyId ? propertyId : "null";

        let sessions: ChatSessionRow[] = [];
        if (contextType === "property" && propertyId && fromStr !== "start" && toStr !== "end") {
          const sessionsRes = await fetch(
            `/api/chat/sessions?propertyId=${encodeURIComponent(propertyId)}&from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}&orgId=${encodeURIComponent(orgId)}`
          );
          if (sessionsRes.ok) {
            const sd = await sessionsRes.json();
            sessions = sd.sessions || [];
            setChatSessions(sessions);
          }
        } else {
          setChatSessions([]);
        }

        const pref = readThreadPref(baseScopeId);
        const chosen =
          pref && sessions.some((s) => s.sessionId === pref)
            ? pref
            : sessions[0]?.sessionId ?? baseScopeId;

        setSessionId(chosen);
        writeThreadPref(baseScopeId, chosen);

        const res = await fetch(
          `/api/chat/history?propertyId=${propParam}&sessionId=${encodeURIComponent(chosen)}&orgId=${encodeURIComponent(orgId)}`
        );

        if (res.ok) {
          const data = await res.json();
          if (data.messages && data.messages.length > 0) {
            setMessages(data.messages.map((m: Message) => hydrateAssistantMessage(m)));
            setIsChatActive(true);
            ariaReadyScopeRef.current = baseScopeId;
            writeAriaReadyToStorage(baseScopeId);
          } else {
            setMessages([]);
            setIsChatActive(isAriaReadyForScope(baseScopeId));
          }
        }
      } catch (err) {
        console.error("Failed to fetch chat history", err);
        setSessionId(baseScopeId);
        setMessages([]);
        setIsChatActive(isAriaReadyForScope(baseScopeId));
      } finally {
        setIsHistoryLoading(false);
      }
    };

    fetchHistory();
  }, [
    contextType,
    propertyId,
    dateRange?.from?.getTime(),
    dateRange?.to?.getTime(),
    isAriaReadyForScope,
    writeAriaReadyToStorage,
    readThreadPref,
    writeThreadPref,
  ]);

  // Fetch calendar metrics when date range or property changes
  useEffect(() => {
    const fetchMetrics = async () => {
      if (contextType !== "property" || !propertyId || !dateRange?.from || !dateRange?.to) {
        setCalendarMetrics(null);
        setGlobalMetrics(null);
        return;
      }

      try {
        const from = format(dateRange.from, "yyyy-MM-dd");
        const to = format(dateRange.to, "yyyy-MM-dd");
        const res = await fetch(`/api/calendar-metrics?listingId=${propertyId}&from=${from}&to=${to}`);

        if (res.ok) {
          const data = await res.json();
          const metrics = {
            occupancy: data.occupancy,
            avgPrice: data.avgPrice,
            bookedDays: data.bookedDays,
            availableDays: data.availableDays,
            blockedDays: data.blockedDays,
            totalDays: data.totalDays,
            calendarDays: data.calendarDays,
            reservations: data.reservations,
          };
          setCalendarMetrics(metrics);
          setGlobalMetrics(metrics);
        }
      } catch (err) {
        console.error("Failed to fetch calendar metrics:", err);
      }
    };

    fetchMetrics();
  }, [contextType, propertyId, dateRange?.from?.getTime(), dateRange?.to?.getTime(), setGlobalMetrics]);

  /**
   * Prime Aria for the current property + date scope: scans market events,
   * benchmarks, and auto-configures guardrails. Returns the new thread
   * sessionId on success (or null on failure).
   *
   * This used to be gated behind an explicit "Run Aria" button. It now runs
   * lazily on the user's first message (see handleSubmit) so the operator can
   * just ask a question and get an answer — no separate activation step.
   *
   * @param opts.clearMessages  Reset the visible thread (used by "New chat").
   */
  const primeAria = async (opts?: { clearMessages?: boolean }): Promise<string | null> => {
    if (isSettingUp || !dateRange?.from || !dateRange?.to) return null;
    const clearMessages = opts?.clearMessages ?? false;

    setIsSettingUp(true);
    useContextStore.getState().setIsMarketAnalysisRunning(true);

    toast("Initializing Aria...", {
      description: "Setting up research agents for your location...",
    });

    try {
      // Simulate multiple toast stages for better UX since it takes a few seconds
      setTimeout(() => {
        if (useContextStore.getState().isMarketAnalysisRunning) {
          toast("Searching Internet...", {
            description: "Scanning for global events, holidays, and competitor rates...",
          });
        }
      }, 3000);

      setTimeout(() => {
        if (useContextStore.getState().isMarketAnalysisRunning) {
          toast("Benchmarking...", {
            description: "Calculating market percentiles and price positioning...",
          });
        }
      }, 7000);

      const response = await fetch("/api/market-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateRange: {
            from: format(dateRange.from, "yyyy-MM-dd"),
            to: format(dateRange.to, "yyyy-MM-dd"),
          },
          context: {
            type: contextType,
            propertyId,
            propertyName,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error?.includes("403") || data.error?.includes("permission")) {
          throw new Error("Lyzr Permission Error: Your API key doesn't have permission to access this Agent.");
        }
        throw new Error(data.error || "Analysis failed");
      }

      // ── New Lyzr thread for this property + date range (keeps history of older threads in DB) ──
      const newFrom = format(dateRange.from, "yyyy-MM-dd");
      const newTo = format(dateRange.to, "yyyy-MM-dd");
      const baseScopeId = buildBaseScopeId(propertyId || undefined, newFrom, newTo);
      const newSessionId = generateThreadSessionId(baseScopeId);

      if (clearMessages) setMessages([]);
      setSessionId(newSessionId);
      writeThreadPref(baseScopeId, newSessionId);
      ariaReadyScopeRef.current = baseScopeId;
      writeAriaReadyToStorage(baseScopeId);
      setIsChatActive(true);
      setChatSessions((prev) => [
        { sessionId: newSessionId, lastMessageAt: new Date().toISOString(), messageCount: 0 },
        ...prev.filter((s) => s.sessionId !== newSessionId),
      ]);

      console.log("🔍 Market Analysis Data Received:", {
        eventsCount: data.eventsCount,
        hasTrace: !!data.sqlTrace,
        traceLength: data.sqlTrace?.length
      });

      // ── TECHNICAL PIPELINE TRACE ──
      // Log to console for debugging, don't clutter the chat UI
      if (data.sqlTrace && data.sqlTrace.length > 0) {
        console.log(`🛠️ [Data Pipeline] ${data.sqlTrace.length} queries executed:`);
        data.sqlTrace.forEach((t: any) => console.log(`  → ${t.name}: ${t.sql.substring(0, 80)}...`));
      }

      // Start with a clean chat — no trace messages
      if (clearMessages) setMessages([]);

      toast.success("Aria is Ready", {
        description: `Analyzed ${data.eventsCount} market signals in ${data.duration}. Ask me anything!`,
      });

      if (data.guardrailsSetByAi && data.guardrails) {
        // Wait a slight moment so they don't overlap too intensely
        setTimeout(() => {
          toast.info("Auto-Guardrails Configured", {
            description: "Aria has set the floor and ceiling values automatically based on market intelligence. Check them; if you want, you can overwrite them too.",
            duration: 8000, // Longer duration for reading
          });
        }, 800);
      }

      triggerMarketRefresh();
      // Data injection now happens automatically on the user's first real message
      // in route.ts — no need for a separate grounding call.

      return newSessionId;
    } catch (error) {
      console.error("Market Analysis Error:", error);
      toast.error("Analysis Failed", {
        description: error instanceof Error ? error.message : "Marketing Agent could not be reached.",
      });
      return null;
    } finally {
      setIsSettingUp(false);
      useContextStore.getState().setIsMarketAnalysisRunning(false);
    }
  };


  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e?: React.FormEvent, overrideText?: string) => {
    e?.preventDefault();
    const text = (overrideText ?? input).trim();
    if (!text || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // Lazy activation: the first question auto-primes Aria (market scan +
    // guardrails) instead of requiring a separate "Run Aria" click. Use the
    // freshly-returned sessionId locally since React state won't have updated
    // by the time we call /api/chat below.
    let effectiveSessionId = sessionId;
    let effectiveActive = isChatActive;
    if (!isChatActive && dateRange?.from && dateRange?.to) {
      setStatusText("Priming Aria — pulling market intel…");
      const primedSessionId = await primeAria({ clearMessages: false });
      if (primedSessionId) {
        effectiveSessionId = primedSessionId;
        effectiveActive = true;
      }
    }
    setStatusText("Connecting to PriceOS…");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          orgId,
          context: {
            type: contextType,
            propertyId: propertyId || undefined,
            propertyName: propertyName || undefined,
            metrics: calendarMetrics ? {
              occupancy: calendarMetrics.occupancy,
              bookedDays: calendarMetrics.bookedDays,
              availableDays: calendarMetrics.availableDays,
              blockedDays: calendarMetrics.blockedDays,
              totalDays: calendarMetrics.totalDays,
              bookableDays: calendarMetrics.totalDays - calendarMetrics.blockedDays,
              avgPrice: calendarMetrics.avgPrice,
            } : undefined
          },
          dateRange: dateRange ? {
            from: format(dateRange.from!, "yyyy-MM-dd"),
            to: dateRange.to ? format(dateRange.to, "yyyy-MM-dd") : format(dateRange.from!, "yyyy-MM-dd"),
          } : undefined,
          isChatActive: effectiveActive,
          sessionId: effectiveSessionId,
        }),
      });

      const stepAgentMap: Record<string, { tool: string; agent: string }> = {
        routing:    { tool: "CRO Router",         agent: "CRO Router" },
        analyzing:  { tool: "Property Analyst",   agent: "Property Analyst" },
        validating: { tool: "PriceGuard",         agent: "PriceGuard" },
        generating: { tool: "Response Generator", agent: "CRO Router" },
      };
      const stepKeys = Object.keys(stepAgentMap);

      const data = await resolveChatResponse<{ message: string; metadata?: unknown; proposals?: unknown[] }>(response, {
        onPoll: (elapsed) => {
          const idx = Math.min(Math.floor(elapsed / 8000), stepKeys.length - 1);
          const step = stepKeys[idx];
          const { agent } = stepAgentMap[step];
          setStatusText(`${agent} is working…`);
        },
      });

      const assistantMsg: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: data.message,
        metadata: data.metadata,
        proposals: data.proposals && data.proposals.length > 0 ? data.proposals : undefined,
        proposalStatus: data.proposals && data.proposals.length > 0 ? "pending" : undefined,
      };
      setMessages(prev => [...prev, assistantMsg]);

      if (data.proposals && data.proposals.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mappedProposals = (data.proposals as any[]).map((p) => ({
          listingId: propertyId,
          date: p.date,
          proposedPrice: p.proposed_price ?? p.proposedPrice,
          changePct: p.change_pct ?? p.changePct,
          reasoning: typeof p.reasoning === "object"
            ? Object.values(p.reasoning as Record<string, string>).filter(Boolean).join(" | ")
            : (p.reasoning ?? ""),
          status: "pending",
        }));
        fetch("/api/proposals/bulk-save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orgId, proposals: mappedProposals }),
        }).then(res => {
          if (res.ok) console.log("✅ Auto-saved proposals as pending");
        }).catch(err => console.error("Auto-save failed", err));
      }
    } catch (error) {
      console.error(`Chat Error:`, error);
      const detail = error instanceof Error ? error.message : "Unknown error";
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: detail.includes("temporarily unavailable") || detail.includes("timed out")
          ? `${detail} Please try again.`
          : `Sorry, I encountered an error: ${detail}`,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setStatusText("");
    }
  };

  // Per-proposal approve/reject — permanent, no toggle. Approve saves immediately.
  const handleProposalDecision = (messageId: string, proposalId: string, decision: "approved" | "rejected") => {
    const msg = messages.find(m => m.id === messageId);
    // Once decided, don't allow changes
    if (msg?.proposalDecisions?.[proposalId]) return;

    // Update UI — mark this proposal as decided
    setMessages((prev) =>
      prev.map((m) =>
        m.id !== messageId
          ? m
          : { ...m, proposalDecisions: { ...(m.proposalDecisions || {}), [proposalId]: decision } }
      )
    );

    // When approved, mark the whole message as saved immediately
    if (decision === "approved") {
      setMessages((prev) =>
        prev.map((m) => (m.id !== messageId ? m : { ...m, proposalStatus: "saved" as const }))
      );
    }

    // ── SYNC: Save to Pricing section in DB ──
    const prop = msg?.proposals?.find(p => p.proposal_id === proposalId);
    if (prop) {
      const reasoning = typeof prop.reasoning === "object"
        ? Object.values(prop.reasoning as Record<string, string>).filter(Boolean).join(" | ")
        : (prop.reasoning ?? "");

      const mapped = {
        date: prop.date,
        currentPrice: prop.current_price ?? prop.currentPrice,
        proposedPrice: prop.proposed_price ?? prop.proposedPrice,
        changePct: prop.change_pct ?? prop.changePct,
        reasoning,
        status: decision,
        listingId: prop.listing_id || prop.listingId || propertyId,
      };

      const finalOrgId = orgId || (msg?.metadata?.orgId as string);
      if (!finalOrgId) {
        console.error("Cannot sync decision: missing orgId");
        return;
      }

      fetch("/api/proposals/bulk-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: finalOrgId, proposals: [mapped] }),
      }).then(res => {
        if (res.ok) {
          toast.success(
            decision === "approved"
              ? "Proposal approved & saved to Pricing section"
              : "Proposal rejected"
          );
        } else {
          toast.error("Failed to sync decision to Pricing section");
        }
      }).catch(err => {
        console.error("Failed to sync decision", err);
        toast.error("Network error syncing decision");
      });
    }
  };

  const handleRejectProposals = (messageId: string) => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg || !msg.proposals) return;

    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, proposalStatus: "rejected" } : m
      )
    );

    // ── SYNC: Update all as rejected in DB ──
    const mapped = msg.proposals.map((p) => ({
      listingId: p.listing_id || p.listingId || propertyId,
      date: p.date,
      proposedPrice: p.proposed_price ?? p.proposedPrice,
      changePct: p.change_pct ?? p.changePct,
      reasoning: p.reasoning,
      status: "rejected"
    }));

    fetch("/api/proposals/bulk-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId, proposals: mapped }),
    })
      .then(() => {
        toast.info("All proposals rejected. Status synced to inventory.");
      })
      .catch((err) => {
        console.error("Failed to sync reject all", err);
        toast.error("Failed to sync rejection to database");
      });
  };

  const handleNewChat = useCallback(() => {
    if (contextType !== "property" || !propertyId || !dateRange?.from || !dateRange?.to) {
      toast.error("Select a property and date range first.");
      return;
    }
    const fromStr = format(dateRange.from, "yyyy-MM-dd");
    const toStr = format(dateRange.to, "yyyy-MM-dd");
    const baseScopeId = buildBaseScopeId(propertyId, fromStr, toStr);
    const newId = generateThreadSessionId(baseScopeId);
    setSessionId(newId);
    writeThreadPref(baseScopeId, newId);
    setMessages([]);
    setIsChatActive(isAriaReadyForScope(baseScopeId));
    setChatSessions((prev) => [
      { sessionId: newId, lastMessageAt: new Date().toISOString(), messageCount: 0 },
      ...prev.filter((s) => s.sessionId !== newId),
    ]);
    toast.success("New chat started", {
      description: "Same property and dates — a fresh thread. Older chats stay in history.",
    });
  }, [contextType, propertyId, dateRange, writeThreadPref, isAriaReadyForScope]);

  const handleSessionSelect = useCallback(
    async (nextId: string) => {
      if (nextId === sessionId) return;
      if (contextType !== "property" || !propertyId || !dateRange?.from || !dateRange?.to) return;
      const fromStr = format(dateRange.from, "yyyy-MM-dd");
      const toStr = format(dateRange.to, "yyyy-MM-dd");
      const baseScopeId = buildBaseScopeId(propertyId, fromStr, toStr);
      setIsHistoryLoading(true);
      setSessionId(nextId);
      writeThreadPref(baseScopeId, nextId);
      try {
        const n = await loadThreadMessages(nextId);
        setIsChatActive(n > 0 || isAriaReadyForScope(baseScopeId));
      } finally {
        setIsHistoryLoading(false);
      }
    },
    [
      sessionId,
      contextType,
      propertyId,
      dateRange,
      writeThreadPref,
      loadThreadMessages,
      isAriaReadyForScope,
    ]
  );

  if (contextType === "portfolio") {
    return (
      <div className="flex flex-col flex-1 items-center justify-center h-full text-muted-foreground p-8 text-center bg-muted/5">
        <Building2 className="h-16 w-16 mb-6 opacity-10" />
        <h3 className="text-xl font-bold text-foreground">Select a Property</h3>
        <p className="mt-2 text-sm max-w-sm">
          Please select a property from the sidebar to view metrics, market signals, and chat with the AI Pricing Analyst.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden h-full">
      <div className="border-b bg-background flex flex-col shrink-0 relative z-10 shadow-sm">
        <div className="flex flex-wrap items-center justify-between px-6 py-4 gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-500/10 p-2">
              <Send className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight">
                {contextType === "property" && propertyName ? propertyName : "Portfolio Overview"}
              </h3>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                Pricing & Market Copilot
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={isSidebarOpen ? "secondary" : "ghost"}
              size="sm"
              onClick={toggleSidebar}
              className="h-9 gap-2"
            >
              {isSidebarOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
              <span className="hidden sm:inline font-bold">Sidebar</span>
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 px-6 pb-4">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 bg-muted/30 p-1.5 rounded-xl border border-border/50 hover:bg-muted/50 transition-colors">

            <div id="tour-date-range">
              <DateRangePicker
                date={dateRange}
                setDate={(newRange) => {
                  setDateRange(newRange);
                  if (!newRange?.from || !newRange?.to) {
                    setIsChatActive(false);
                    ariaReadyScopeRef.current = null;
                  }
                }}
              />
            </div>

            {contextType === "property" && propertyId && dateRange?.from && dateRange?.to && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleNewChat}
                  disabled={isLoading || isSettingUp}
                  className="h-9 gap-2 bg-background hover:bg-background/80 border-border/50 font-bold shadow-sm shrink-0"
                >
                  <MessageSquarePlus className="h-4 w-4" />
                  <span className="hidden sm:inline">New chat</span>
                </Button>
                {sessionSelectOptions.length > 0 && (
                  <Select value={sessionId} onValueChange={handleSessionSelect}>
                    <SelectTrigger className="h-9 w-[min(240px,42vw)] text-[10px] font-bold bg-background border-border/50 shrink-0">
                      <SelectValue placeholder="Chat thread" />
                    </SelectTrigger>
                    <SelectContent>
                      {sessionSelectOptions.map((s, i) => (
                        <SelectItem key={s.sessionId} value={s.sessionId} className="text-xs font-medium">
                          Chat {sessionSelectOptions.length - i} · {s.messageCount} msg
                          {s.messageCount === 1 ? "" : "s"} · {format(new Date(s.lastMessageAt), "MMM d")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </>
            )}

          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 overflow-hidden relative">

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {isHistoryLoading && <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}

            {!isHistoryLoading && messages.length === 0 && !isLoading && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-5 px-6 py-12">
                <div>
                  <p className="text-base font-bold text-foreground">
                    Ask Aria about {contextType === "property" && propertyName ? propertyName : "your portfolio"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Aria pulls market events, competitor rates, and your booking pace automatically.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 max-w-xl">
                  {SUGGESTED_PROMPTS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handleSubmit(undefined, p)}
                      className="text-xs font-medium px-3 py-2 rounded-full border border-border/60 bg-background/60 text-foreground/80 hover:bg-muted hover:text-foreground transition-colors"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl p-4 shadow-xl ${message.role === "user" ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-background/60 backdrop-blur-xl border border-border/50 text-foreground rounded-tl-none"}`}>
                  <div className="break-words">
                    <MarkdownMessage content={message.content} isUser={message.role === "user"} />
                  </div>
                  {message.proposals && message.proposals.length > 0 && (() => {
                    // ── helpers ────────────────────────────────────────────────
                    const computeConfidence = (p: typeof message.proposals[0]): number => {
                      let s = 55;
                      if (p.guard_verdict === "APPROVED") s += 18;
                      else if (p.guard_verdict === "FLAGGED") s -= 18;
                      else if (p.guard_verdict === "REJECTED") s -= 35;
                      if (p.risk_level === "low") s += 15;
                      else if (p.risk_level === "medium") s += 5;
                      else if (p.risk_level === "high") s -= 8;
                      const compCount = [p.comparisons?.vs_p50, p.comparisons?.vs_recommended, p.comparisons?.vs_top_comp].filter(Boolean).length;
                      s += compCount * 4;
                      if (p.reasoning && typeof p.reasoning === "object") s += Math.min(Object.keys(p.reasoning).length * 2, 8);
                      return Math.max(22, Math.min(96, s));
                    };

                    const REASON_META: Record<string, { label: string; icon: string }> = {
                      reason_market:    { label: "Market Signal",  icon: "📊" },
                      reason_benchmark: { label: "Benchmark",      icon: "📈" },
                      reason_historic:  { label: "Historic",       icon: "🕐" },
                      reason_seasonal:  { label: "Seasonal",       icon: "🌤" },
                      reason_guardrails:{ label: "Guardrails",     icon: "🛡" },
                      reason_news:      { label: "News & Events",  icon: "📰" },
                      reason_event:     { label: "Event",          icon: "🗓" },
                    };

                    const approvedCount = message.proposals.filter(p => message.proposalDecisions?.[p.proposal_id] === "approved").length;

                    return (
                    <div className="mt-5 rounded-2xl overflow-hidden border border-border/40 shadow-lg">
                      {/* ── Panel header ─────────────────────────────────── */}
                      <div className="px-4 py-3 bg-gradient-to-r from-primary/8 to-primary/5 border-b border-border/40 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black uppercase tracking-[0.18em] text-primary">Aria Pricing Proposals</span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{message.proposals.length}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {approvedCount > 0 && (
                            <span className="text-[10px] font-black text-emerald-500">✓ {approvedCount} approved</span>
                          )}
                          {message.proposalStatus === "saved" && (
                            <span className="text-[10px] font-black text-emerald-500 flex items-center gap-1"><IconCircleCheck className="size-3" /> Saved to Pricing</span>
                          )}
                          {message.proposalStatus === "rejected" && (
                            <span className="text-[10px] font-black text-muted-foreground">✗ All rejected</span>
                          )}
                        </div>
                      </div>

                      {/* ── Proposal cards ───────────────────────────────── */}
                      <div className="p-3 space-y-3 bg-background/40 backdrop-blur-sm">
                        {message.proposals.map((prop, idx) => {
                          const decision = message.proposalDecisions?.[prop.proposal_id];
                          const isApproved = decision === "approved";
                          const isRejected = decision === "rejected" || prop.guard_verdict === "REJECTED";
                          const isDecided = isApproved || decision === "rejected";
                          const isFlagged = prop.guard_verdict === "FLAGGED";
                          const canApprove = prop.guard_verdict !== "REJECTED";
                          const confidence = computeConfidence(prop);
                          const confLabel = confidence >= 75 ? "High" : confidence >= 50 ? "Medium" : "Low";
                          const confBarCls = confidence >= 75 ? "bg-emerald-500" : confidence >= 50 ? "bg-primary" : "bg-red-400";
                          const confTextCls = confidence >= 75 ? "text-emerald-500" : confidence >= 50 ? "text-primary" : "text-red-400";
                          const isDown = prop.change_pct < 0;

                          const reasoningEntries = (() => {
                            if (!prop.reasoning) return [];
                            if (typeof prop.reasoning === "string") return [{ key: "reasoning", label: "Reasoning", icon: "💬", text: prop.reasoning }];
                            return Object.entries(prop.reasoning as Record<string, string>)
                              .filter(([, v]) => v)
                              .map(([k, v]) => ({ key: k, label: REASON_META[k]?.label ?? k.replace("reason_", ""), icon: REASON_META[k]?.icon ?? "•", text: v }));
                          })();

                          return (
                            <div key={idx} className={`rounded-xl border overflow-hidden transition-all ${
                              isApproved ? "border-emerald-500/30 bg-emerald-500/5" :
                              isRejected ? "border-red-400/20 bg-red-500/5 opacity-55" :
                              isFlagged  ? "border-primary/30 bg-primary/5" :
                              "border-border/30 bg-background/60"
                            }`}>

                              {/* ── Card header ──────────────────────────── */}
                              <div className="px-4 py-2.5 border-b border-border/20 flex items-center justify-between bg-muted/10">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-black tabular-nums">{prop.date}</span>
                                  {prop.date_classification && (
                                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-muted/50 text-muted-foreground border border-border/30">
                                      {prop.date_classification}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {isApproved && (
                                    <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-500 border border-emerald-500/25 flex items-center gap-1">
                                      <IconCircleCheck className="size-2.5" /> Approved & Saved
                                    </span>
                                  )}
                                  {decision === "rejected" && (
                                    <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-red-500/15 text-red-400 border border-red-400/25">✗ Rejected</span>
                                  )}
                                  {!isDecided && (
                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-md border ${
                                      prop.guard_verdict === "APPROVED" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                                      prop.guard_verdict === "FLAGGED"  ? "bg-primary/10 text-primary border-primary/20" :
                                      "bg-red-500/10 text-red-400 border-red-400/20"
                                    }`}>
                                      {prop.guard_verdict === "APPROVED" ? "✓ PriceGuard OK" : prop.guard_verdict === "FLAGGED" ? "⚠ Flagged" : "✗ Blocked"}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* ── Price row ────────────────────────────── */}
                              <div className="px-4 py-3 flex items-center gap-4 border-b border-border/20">
                                {/* Current price */}
                                <div className="text-center">
                                  <p className="text-[9px] text-muted-foreground uppercase tracking-wide font-semibold mb-0.5">Current</p>
                                  <p className="text-sm font-bold line-through opacity-40 tabular-nums">AED {prop.current_price}</p>
                                </div>
                                {/* Arrow + change */}
                                <div className="flex-1 flex flex-col items-center">
                                  <div className={`text-[11px] font-black px-2 py-0.5 rounded-full tabular-nums ${isDown ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-500"}`}>
                                    {isDown ? "▼" : "▲"} {Math.abs(prop.change_pct)}%
                                  </div>
                                  <div className="w-full h-px bg-border/30 mt-1.5 relative">
                                    <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full ${isDown ? "bg-red-400" : "bg-emerald-500"}`} />
                                  </div>
                                </div>
                                {/* Proposed price */}
                                <div className="text-center">
                                  <p className="text-[9px] text-muted-foreground uppercase tracking-wide font-semibold mb-0.5">Proposed</p>
                                  <p className="text-xl font-black tabular-nums text-primary">AED {prop.proposed_price}</p>
                                </div>
                                {/* Risk badge */}
                                <span className={`ml-auto text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border ${
                                  prop.risk_level === "low"    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                                  prop.risk_level === "medium" ? "bg-primary/10 text-primary border-primary/20" :
                                  "bg-red-500/10 text-red-400 border-red-400/20"
                                }`}>
                                  {prop.risk_level} risk
                                </span>
                              </div>

                              {/* ── Confidence bar ───────────────────────── */}
                              <div className="px-4 py-2.5 border-b border-border/20 bg-muted/5">
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">AI Confidence</span>
                                  <span className={`text-[9px] font-black ${confTextCls}`}>{confLabel} · {confidence}%</span>
                                </div>
                                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                                  <div className={`h-full rounded-full transition-all duration-700 ${confBarCls}`} style={{ width: `${confidence}%` }} />
                                </div>
                              </div>

                              {/* ── Market comparisons ───────────────────── */}
                              {(prop.comparisons?.vs_p50 || prop.comparisons?.vs_recommended || prop.comparisons?.vs_top_comp) && (
                                <div className="px-4 py-3 border-b border-border/20 grid grid-cols-3 gap-3">
                                  {[
                                    { label: "vs Market P50", data: prop.comparisons?.vs_p50 },
                                    { label: "vs Recommended", data: prop.comparisons?.vs_recommended },
                                    { label: `vs ${prop.comparisons?.vs_top_comp?.comp_name ?? "Top Comp"}`, data: prop.comparisons?.vs_top_comp },
                                  ].map(({ label, data }) => {
                                    if (!data) return null;
                                    const d = data as Record<string, unknown>;
                                    const compPrice = d.comp_price as number;
                                    const diffPct = d.diff_pct as number;
                                    const isPos = diffPct >= 0;
                                    return (
                                      <div key={label} className="flex flex-col gap-1">
                                        <span className="text-[9px] text-muted-foreground font-medium truncate">{label}</span>
                                        <span className="text-[10px] font-black tabular-nums text-muted-foreground">
                                          AED {compPrice}
                                        </span>
                                        <span className={`text-[10px] font-black tabular-nums ${isPos ? "text-emerald-500" : "text-red-400"}`}>
                                          {diffPct > 0 ? "+" : ""}{diffPct}%
                                        </span>
                                        {/* mini bar */}
                                        <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                                          <div
                                            className={`h-full rounded-full ${isPos ? "bg-emerald-500/60" : "bg-red-400/60"}`}
                                            style={{ width: `${Math.min(100, Math.abs(diffPct))}%` }}
                                          />
                                        </div>
                                        {/* formula */}
                                        <span className="text-[8px] font-mono text-muted-foreground/40 leading-tight mt-0.5 select-all">
                                          ({prop.proposed_price} − {compPrice}) ÷ {compPrice} × 100
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {/* ── Reasoning (collapsible) ──────────────── */}
                              {reasoningEntries.length > 0 && (
                                <details className="group border-b border-border/20">
                                  <summary className="px-4 py-2.5 flex items-center justify-between cursor-pointer list-none bg-muted/5 hover:bg-muted/10 transition-colors">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Analysis & Reasoning</span>
                                    <span className="text-[9px] text-muted-foreground group-open:rotate-180 transition-transform">▼</span>
                                  </summary>
                                  <div className="px-4 py-3 grid grid-cols-1 gap-2">
                                    {reasoningEntries.map(({ key, label, icon, text }) => (
                                      <div key={key} className="flex gap-2.5 rounded-lg bg-muted/20 border border-border/20 px-3 py-2">
                                        <span className="text-sm shrink-0 mt-0.5">{icon}</span>
                                        <div className="min-w-0">
                                          <p className="text-[9px] font-black uppercase tracking-wide text-muted-foreground mb-0.5">{label}</p>
                                          <p className="text-[11px] text-foreground/80 leading-snug">{text}</p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              )}

                              {/* ── PriceGuard flagged warning ───────────── */}
                              {isFlagged && !isDecided && (
                                <div className="px-4 py-2.5 bg-primary/5 border-b border-primary/20 flex items-start gap-2">
                                  <span className="text-sm mt-0.5">⚠</span>
                                  <p className="text-[11px] text-primary/90 leading-snug">PriceGuard flagged this — outside normal range but not hard-blocked. Approve with caution.</p>
                                </div>
                              )}

                              {/* ── Action buttons ───────────────────────── */}
                              {!isDecided && message.proposalStatus !== "rejected" && (
                                <div className="px-4 py-3 flex items-center gap-2.5">
                                  {canApprove ? (
                                    <button
                                      onClick={() => handleProposalDecision(message.id, prop.proposal_id, "approved")}
                                      className="flex-1 py-2 rounded-lg text-[11px] font-black bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 hover:bg-emerald-500/20 transition-all"
                                    >
                                      ✓ Approve & Save
                                    </button>
                                  ) : (
                                    <span className="text-[10px] text-red-400/70 font-bold">Blocked by PriceGuard</span>
                                  )}
                                  <button
                                    onClick={() => handleProposalDecision(message.id, prop.proposal_id, "rejected")}
                                    className="flex-1 py-2 rounded-lg text-[11px] font-black bg-red-500/10 text-red-400 border border-red-400/30 hover:bg-red-500/20 transition-all"
                                  >
                                    ✗ Reject
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* ── Panel footer ─────────────────────────────────── */}
                      {message.proposalStatus === "pending" && (
                        <div className="px-4 py-3 border-t border-border/40 bg-muted/10 flex items-center justify-between gap-3">
                          <p className="text-[10px] text-muted-foreground">Approved proposals are saved to Pricing instantly.</p>
                          <button
                            onClick={() => handleRejectProposals(message.id)}
                            className="text-[10px] font-black px-3 py-1.5 rounded-lg border border-border/50 text-muted-foreground hover:bg-muted transition-colors shrink-0"
                          >
                            Reject All
                          </button>
                        </div>
                      )}
                      {message.proposalStatus === "saved" && (
                        <div className="px-4 py-3 border-t border-border/40 bg-emerald-500/5 flex items-center gap-2">
                          <span className="text-[11px] text-emerald-600 font-black">✓ Saved to Pricing</span>
                          <span className="text-[10px] text-muted-foreground">— review and push to Hostaway from the Pricing page</span>
                        </div>
                      )}
                      {message.proposalStatus === "rejected" && (
                        <div className="px-4 py-3 border-t border-border/40 bg-muted/10 flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground font-bold">✗ All proposals rejected. No changes made.</span>
                        </div>
                      )}
                    </div>
                    );
                  })()}
                </div>
              </div>
            ))}
            {isLoading && <div className="flex justify-start"><Card className="max-w-2xl"><CardContent className="p-4 flex items-center space-x-3"><Loader2 className="h-4 w-4 animate-spin text-amber" /><span className="text-sm text-muted-foreground animate-pulse">{statusText || "Thinking…"}</span></CardContent></Card></div>}
            <div ref={messagesEndRef} />
          </div>

          <div id="tour-chat-input" className="border-t p-4 bg-background">
            <form onSubmit={handleSubmit} className="flex space-x-2">
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex-1">
                      <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={isSettingUp ? "Priming Aria — pulling market intel…" : "Ask about pricing, events, market rates..."}
                        disabled={isLoading}
                        className="w-full"
                      />
                    </div>
                  </TooltipTrigger>
                </Tooltip>
              </TooltipProvider>
              <Button type="submit" disabled={isLoading || !input.trim()}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div >
  );
}

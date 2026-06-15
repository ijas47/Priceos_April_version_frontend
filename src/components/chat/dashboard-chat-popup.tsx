"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, Loader2, RefreshCw, X, Activity } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { resolveChatResponse } from "@/lib/api/poll-job";
import { cn } from "@/lib/utils";
import { useLyzrAgentEvents } from "@/hooks/use-lyzr-agent-events";
// import { LiveInferenceFlowGraph, type FlowStage } from "./live-inference-flow-graph";
export interface FlowStage {
  id: string;
  label: string;
  status: "pending" | "active" | "done" | "failed";
}
import { SUPPORT_AGENT_STREAM_EVENT, type SupportAgentStreamEventPayload } from "@/lib/chat/inference-events";

const DASHBOARD_STAGES: FlowStage[] = [
  { id: "routing", label: "Portfolio Router", status: "pending" },
  { id: "analyzing", label: "Data Analyst", status: "pending" },
  { id: "generating", label: "Response", status: "pending" },
];

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface DashboardChatPopupProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DashboardChatPopup({ isOpen, onOpenChange }: DashboardChatPopupProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [sessionId, setSessionId] = useState<string>("");
  const [graphQueryId, setGraphQueryId] = useState<string>("");
  const [showGraph, setShowGraph] = useState(false);
  const [stages, setStages] = useState<FlowStage[]>(DASHBOARD_STAGES);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { isConnected: isGraphConnected, events: graphEvents } = useLyzrAgentEvents(graphQueryId, isLoading);

  useEffect(() => {
    if (isOpen && !sessionId) {
      startNewSession();
    }
  }, [isOpen]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const startNewSession = () => {
    const newSessionId = `dash-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setSessionId(newSessionId);
    setMessages([]);
  };

  const getDisplayMessage = (raw: string): string => {
    const trimmed = (raw || "").trim();
    if (!trimmed) return "I couldn't process that request. Please try again.";
    if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return trimmed;
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed?.chat_response === "string" && parsed.chat_response.trim()) {
        return parsed.chat_response.trim();
      }
      if (typeof parsed?.message === "string" && parsed.message.trim()) {
        return parsed.message.trim();
      }
      return trimmed;
    } catch {
      return trimmed;
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const outgoing = input;
    setInput("");
    setIsLoading(true);
    setStatusText("Connecting to PriceOS…");
    setShowGraph(true);

    // Fresh ID per query → hook resets events, WebSocket reconnects
    const newGraphId = `dash-gq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setGraphQueryId(newGraphId);
    setStages(DASHBOARD_STAGES.map(s => ({ ...s, status: "pending" })));

    const emitGraphEvent = (event: SupportAgentStreamEventPayload["event"]) => {
      if (typeof window === "undefined") return;
      window.dispatchEvent(new CustomEvent<SupportAgentStreamEventPayload>(SUPPORT_AGENT_STREAM_EVENT, {
        detail: { sessionId: newGraphId, event },
      }));
    };

    // Emit initial "routing" stage after a tick so the hook re-subscribes first
    setTimeout(() => {
      emitGraphEvent({ timestamp: new Date().toISOString(), event_type: "tool_called", tool_name: "Portfolio Router", agent_name: "Portfolio Router", iteration: 1, status: "active" });
      setStages(prev => prev.map(s => s.id === "routing" ? { ...s, status: "active" } : s));
    }, 80);

    try {
      const response = await fetch("/api/chat/global", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: outgoing,
          sessionId: sessionId,
          graphSessionId: newGraphId,
        }),
      });

      // Animate graph stages while waiting for response
      setTimeout(() => {
        emitGraphEvent({ timestamp: new Date().toISOString(), event_type: "tool_response", tool_name: "Portfolio Router", agent_name: "Portfolio Router", iteration: 1, status: "done" });
        emitGraphEvent({ timestamp: new Date().toISOString(), event_type: "tool_called", tool_name: "Data Analyst", agent_name: "Data Analyst", iteration: 1, status: "active" });
        setStages(prev => prev.map(s => s.id === "routing" ? { ...s, status: "done" } : s.id === "analyzing" ? { ...s, status: "active" } : s));
        setStatusText("Data Analyst is working…");
      }, 3000);

      const data = await resolveChatResponse<{ message: string }>(response);

      emitGraphEvent({ timestamp: new Date().toISOString(), event_type: "tool_response", tool_name: "Data Analyst", agent_name: "Data Analyst", iteration: 1, status: "done" });
      emitGraphEvent({ timestamp: new Date().toISOString(), event_type: "tool_called", tool_name: "Response", agent_name: "Portfolio Router", iteration: 1, status: "active" });
      emitGraphEvent({ timestamp: new Date().toISOString(), event_type: "output_generated", message: "Portfolio analysis complete", status: "done" });
      setStages(prev => prev.map(s => ({ ...s, status: "done" })));

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: getDisplayMessage(data.message || ""),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Chat error:", error);
      toast.error("Failed to connect to the assistant.");
    } finally {
      setIsLoading(false);
      setStatusText("");
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed top-0 right-0 z-50 flex flex-col h-full w-[400px] border-l border-border-default bg-surface-1 shadow-2xl transition-transform duration-300"
      role="dialog"
      aria-label="Portfolio assistant chat"
    >
      {/* Header — same structure as Guest Inbox Aria panel */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-7 w-7 rounded-lg bg-amber/10 border border-amber/20 flex items-center justify-center shrink-0">
            <Bot className="h-4 w-4 text-amber" />
          </div>
          <div className="min-w-0">
            <p className="text-body-xs font-semibold text-text-primary truncate">Aria</p>
            <p className="text-[10px] text-text-tertiary truncate">Portfolio Assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {graphQueryId && (
            <button
              type="button"
              onClick={() => setShowGraph(v => !v)}
              title={showGraph ? "Hide execution graph" : "Show execution graph"}
              className={cn("p-1.5 rounded-md transition-colors", showGraph ? "text-amber" : "text-text-tertiary hover:text-amber")}
            >
              <Activity className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={startNewSession}
            title="New session"
            className="p-1.5 rounded-md text-text-tertiary hover:text-amber transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            title="Close"
            className="p-1.5 rounded-md text-text-tertiary hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="px-4 py-2 border-b border-border-subtle/50 shrink-0">
        <p className="text-[10px] text-text-disabled leading-relaxed">
          Ask about portfolio performance, revenue trends, or which properties need attention
        </p>
      </div>

      {/* Live Execution Graph — collapses when hidden */}
      {showGraph && graphQueryId && (
        <div className="shrink-0 border-b border-border-subtle/50 bg-muted/10" style={{ height: 220 }}>
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-subtle/30">
            <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground">
              <span className={cn("h-1.5 w-1.5 rounded-full", isGraphConnected ? "bg-emerald-500 animate-pulse" : "bg-primary")} />
              Execution Graph
            </span>
            <button type="button" onClick={() => setShowGraph(false)} className="text-text-tertiary hover:text-foreground p-0.5">
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="relative" style={{ height: 180 }}>
            {/* Live graph removed */}
          </div>
        </div>
      )}

      <ScrollArea className="flex-1 min-h-0 px-4 py-3">
        <div className="flex flex-col gap-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn("flex flex-col", message.role === "user" ? "items-end" : "items-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] px-3 py-2 rounded-xl text-body-xs leading-relaxed",
                  message.role === "user"
                    ? "bg-amber text-black font-medium rounded-tr-none"
                    : "bg-surface-2 border border-border-subtle text-text-primary rounded-tl-none"
                )}
              >
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                </div>
              </div>
              <span className="text-[9px] text-text-disabled mt-0.5 px-1">
                {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))}
          {isLoading && (
            <div className="flex items-center gap-2 text-text-tertiary">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span className="text-[10px]">{statusText || "Aria is thinking…"}</span>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      <div className="px-4 pt-2 flex flex-wrap gap-1.5 shrink-0 border-t border-border-subtle/50">
        {["Underperforming properties", "Revenue summary", "Market trends"].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setInput(s)}
            className="text-[10px] px-2 py-1 rounded-full bg-surface-2 border border-border-subtle text-text-secondary hover:border-amber/40 hover:text-amber transition-colors"
          >
            {s}
          </button>
        ))}
      </div>

      <form onSubmit={handleSend} className="flex items-center gap-2 px-4 py-3 border-t border-border-subtle shrink-0">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Aria anything..."
          className="h-9 text-body-xs bg-surface-2 border-border-subtle focus:border-amber/50"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!input.trim() || isLoading}
          className="h-9 w-9 bg-amber text-black hover:bg-amber/80 shrink-0"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
    Send, Loader2, RefreshCw, User,
    ChevronLeft, ChevronRight, Sparkles, PanelLeftClose, PanelLeftOpen,
    MessageSquare, Building2, CloudDownload, Zap, Activity, Maximize2, Bot, X
} from "lucide-react";
import { useContextStore } from "@/stores/context-store";
import { toast } from "sonner";
// import { LiveInferenceFlowGraph, type FlowStage } from "./live-inference-flow-graph";
export interface FlowStage {
    id: string;
    label: string;
    status: "pending" | "active" | "done" | "failed";
}
import type { LyzrAgentEvent } from "@/hooks/use-lyzr-agent-events";
import { pollJob } from "@/lib/api/poll-job";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface Message {
    id: string;
    sender: 'guest' | 'admin';
    text: string;
    time: string;
}

interface SimulatedConversation {
    id: string;
    guestName: string;
    lastMessage: string;
    status: 'needs_reply' | 'resolved';
    messages: Message[];
    listingId?: string;
    unreadCount?: number;
}

const GUEST_GRAPH_STAGES: FlowStage[] = [
    { id: "routing", label: "Guest Intent", status: "pending" },
    { id: "analyzing", label: "Context Read", status: "pending" },
    { id: "validating", label: "Draft Reply", status: "pending" },
    { id: "generating", label: "Final Response", status: "pending" },
];

export function GuestChatInterface({
    orgId,
    initialPropertyId = null,
    initialPropertyName = null,
    initialPropertyCurrency = "AED",
    initialConversationId = null,
}: {
    orgId: string;
    initialPropertyId?: string | null;
    initialPropertyName?: string | null;
    initialPropertyCurrency?: string;
    initialConversationId?: string | null;
}) {
    const searchParams = useSearchParams();
    const {
        contextType,
        propertyId,
        propertyName,
        setConversationSummary,
        conversationSummary,
        setPropertyContext,
    } = useContextStore();

    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [replyText, setReplyText] = useState("");
    const [conversations, setConversations] = useState<SimulatedConversation[]>([]);
    const [isSuggesting, setIsSuggesting] = useState(false);
    const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
    const [isInboxCollapsed, setIsInboxCollapsed] = useState(false);
    const [isSummaryCollapsed, setIsSummaryCollapsed] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isSyncingHostaway, setIsSyncingHostaway] = useState(false);
    const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
    const [highlightConversationId, setHighlightConversationId] = useState<string | null>(initialConversationId);
    const autoRepliedIds = useRef<Set<string>>(new Set());
    const requestedConversationIdRef = useRef<string | null>(initialConversationId);
    const [showLiveGraph, setShowLiveGraph] = useState(false);
    const [isGraphExpanded, setIsGraphExpanded] = useState(false);
    const [isSimulationMode, setIsSimulationMode] = useState(false);
    const [graphStages, setGraphStages] = useState<FlowStage[]>(GUEST_GRAPH_STAGES);
    const setIsGraphProcessing = (_: boolean) => {}; // graph processing tracked via graphFlowStatus
    const [graphEvents, setGraphEvents] = useState<LyzrAgentEvent[]>([]);
    const [graphFlowStatus, setGraphFlowStatus] = useState<string>("pending");
    const [lastThinkingMessage, setLastThinkingMessage] = useState<string | null>(null);
    const [testMessages, setTestMessages] = useState<Array<{ id: string; text: string; sender: "guest" | "agent"; time: string }>>([]);
    const [testInput, setTestInput] = useState("");
    const [isTestRunning, setIsTestRunning] = useState(false);
    const testScrollRef = useRef<HTMLDivElement>(null);

    const pushGraphEvent = (event: LyzrAgentEvent) => {
        setGraphEvents(prev => [...prev, event]);
        if (event.thinking || event.message) {
            setLastThinkingMessage(event.thinking || event.message || null);
        }
    };

    useEffect(() => {
        if (initialPropertyId) {
            setPropertyContext(initialPropertyId, initialPropertyName || "Our Property");
        }
    }, [initialPropertyId, initialPropertyName, setPropertyContext]);

    useEffect(() => {
        const propertyFromQuery = searchParams.get("propertyId") || initialPropertyId;
        if (!propertyFromQuery) return;
        if (propertyId === propertyFromQuery && contextType === "property") return;
        setPropertyContext(
            propertyFromQuery,
            initialPropertyName || propertyName || "Selected Property",
            initialPropertyCurrency
        );
    }, [
        contextType,
        initialPropertyCurrency,
        initialPropertyId,
        initialPropertyName,
        propertyId,
        propertyName,
        searchParams,
        setPropertyContext,
    ]);

    const syncFromHostaway = async () => {
        if (!propertyId) return;
        setIsSyncingHostaway(true);
        toast.loading("Syncing conversations from Hostaway...", { id: "sync_hostaway" });
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/hostaway/conversations?listingId=${propertyId}&orgId=${orgId}`, {
                headers: { "Authorization": `Bearer ${localStorage.getItem("priceos-token")}` }
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Failed to sync from Hostaway");
            const syncedConversations = data.conversations || [];
            setConversations(syncedConversations);
            setActiveConversationId((prev) =>
                prev && syncedConversations.some((c: SimulatedConversation) => c.id === prev)
                    ? prev
                    : syncedConversations[0]?.id || null
            );
            toast.success(`Synced ${syncedConversations.length} threads from Hostaway`, { id: "sync_hostaway" });
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to sync conversations", { id: "sync_hostaway" });
        } finally {
            setIsSyncingHostaway(false);
        }
    };

    const fetchConversations = async (showLoadingToast = false) => {
        if (!propertyId) return;
        setIsLoading(true);

        if (showLoadingToast) toast.loading("Fetching conversations...", { id: "fetch_conv" });

        try {
            // 1) Load cached conversations
            const convRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/hostaway/conversations/cached?listingId=${propertyId}&orgId=${orgId}`, {
                headers: { "Authorization": `Bearer ${localStorage.getItem("priceos-token")}` }
            });
            if (convRes.ok) {
                const convData = await convRes.json();
                const cachedConversations = convData.conversations || [];
                setConversations(cachedConversations);
                const requestedConversationId = searchParams.get("conversationId") || requestedConversationIdRef.current;
                if (requestedConversationId && cachedConversations.some((c: SimulatedConversation) => c.id === requestedConversationId)) {
                    setActiveConversationId(requestedConversationId);
                    requestedConversationIdRef.current = requestedConversationId;
                }

                // 2) If cache is empty, sync from Hostaway live API for this property
                if (cachedConversations.length === 0) {
                    const liveRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/hostaway/conversations?listingId=${propertyId}&orgId=${orgId}`, {
                        headers: { "Authorization": `Bearer ${localStorage.getItem("priceos-token")}` }
                    });
                    if (liveRes.ok) {
                        const liveData = await liveRes.json();
                        const syncedConversations = liveData.conversations || [];
                        setConversations(syncedConversations);
                        const requestedConversationId = searchParams.get("conversationId") || requestedConversationIdRef.current;
                        if (requestedConversationId && syncedConversations.some((c: SimulatedConversation) => c.id === requestedConversationId)) {
                            setActiveConversationId(requestedConversationId);
                            requestedConversationIdRef.current = requestedConversationId;
                        }
                        if (showLoadingToast) {
                            toast.success(`Synced ${syncedConversations.length} threads from Hostaway`, { id: "fetch_conv" });
                        }
                    } else if (showLoadingToast) {
                        toast.error("Failed to sync conversations from Hostaway", { id: "fetch_conv" });
                    }
                } else if (showLoadingToast) {
                    toast.success(`Loaded ${cachedConversations.length} active threads`, { id: "fetch_conv" });
                }
            }

            // Load cached summary
            const sumRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/hostaway/summary?listingId=${propertyId}&orgId=${orgId}`, {
                headers: { "Authorization": `Bearer ${localStorage.getItem("priceos-token")}` }
            });
            if (sumRes.ok) {
                const sumData = await sumRes.json();
                if (sumData.summary) setConversationSummary(sumData.summary);
            }
        } catch (e) {
            console.warn("Failed to load cached conversations", e);
            if (showLoadingToast) toast.error("Failed to load conversations", { id: "fetch_conv" });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        setConversations([]);
        setActiveConversationId(null);
        setConversationSummary(null);
        setReplyText("");
        fetchConversations();
    }, [propertyId, searchParams]);

    useEffect(() => {
        const shouldHighlight = searchParams.get("highlight") === "1";
        const requestedConversationId = searchParams.get("conversationId") || initialConversationId;
        if (!shouldHighlight || !requestedConversationId) return;
        setHighlightConversationId(requestedConversationId);
        const timeout = window.setTimeout(() => setHighlightConversationId(null), 3500);
        return () => window.clearTimeout(timeout);
    }, [initialConversationId, searchParams]);

    // ── Escalation Creator ────────────────────────────────────────────────────
    const createEscalation = async (parsed: any, conversationId: string) => {
        const triage = parsed?.triage || {};
        const urgencyRaw: string = triage.urgency || "high";
        const escalationUrgency = urgencyRaw === "critical" ? "immediate" : urgencyRaw === "high" ? "high" : "normal";
        const description = `[ESCALATION] ${triage.guest_intent || "Complex guest situation"} | Sentiment: ${triage.sentiment || "unknown"} | ${parsed?.chat_response || "Requires immediate human PM attention"}`;

        try {
            // First, create an ops ticket so it appears in Operations
            const ticketRes = await fetch("/api/guest-agent/create-ops-ticket", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    orgId: orgId,
                    reservationId: conversationId,
                    threadId: conversationId,
                    listingId: (propertyId && propertyId !== "undefined" && propertyId !== "null") ? propertyId : undefined,
                    category: "other",
                    description,
                    severity: "critical",
                }),
            });
            if (ticketRes.ok) {
                toast.warning("🚨 Escalation ticket created — human PM review required", { duration: 6000, id: "escalate-ticket" });
            } else {
                console.warn("[ESCALATION] Ticket creation failed:", await ticketRes.text());
            }

            // Also attempt to escalate the thread if a valid thread exists
            const escalateRes = await fetch("/api/guest-agent/escalate-thread", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    threadId: conversationId,
                    reason: `${triage.guest_intent || "Complex situation"} — sentiment: ${triage.sentiment || "unknown"}`,
                    urgency: escalationUrgency,
                    contextSummary: parsed?.chat_response || triage.guest_intent || "Requires human review",
                    draftReply: parsed?.suggested_reply?.content,
                }),
            });
            if (!escalateRes.ok) {
                // Thread may be a Hostaway ID, not a GuestThread ID — silently skip
                console.warn("[ESCALATION] Thread escalation skipped (no matching GuestThread)");
            }
        } catch (e) {
            console.error("[ESCALATION] Error:", e);
        }
    };

    // ── Ops Ticket Creator ────────────────────────────────────────────────────
    const createOpsTicket = async (parsed: any, conversationId: string) => {
        const triage = parsed?.triage || {};
        const intent: string = triage.guest_intent || "other";
        const urgency: string = triage.urgency || "medium";
        const description: string =
            parsed?.suggested_reply?.content ||
            parsed?.chat_response ||
            `Guest reported: ${intent}`;

        // Map guest intent → ticket category
        const categoryMap: Record<string, string> = {
            maintenance_complaint: "maintenance",
            maintenance_report: "maintenance",
            housekeeping: "housekeeping",
            noise_complaint: "noise",
            noise: "noise",
            access_issue: "access",
            amenity_fault: "amenity_fault",
        };
        const category = categoryMap[intent] || "other";

        // Map urgency → severity
        const severityMap: Record<string, string> = {
            critical: "critical",
            high: "high",
            medium: "medium",
            low: "low",
        };
        const severity = severityMap[urgency] || "medium";

        try {
            const res = await fetch("/api/guest-agent/create-ops-ticket", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    orgId: orgId,
                    reservationId: conversationId,
                    threadId: conversationId,
                    listingId: (propertyId && propertyId !== "undefined" && propertyId !== "null") ? propertyId : undefined,
                    category,
                    description,
                    severity,
                }),
            });

            if (res.ok) {
                const data = await res.json();
                toast.success(
                    `🔧 Ops ticket created (${data.slaHours}h SLA) — view in Operations`,
                    { duration: 5000, id: "ops-ticket" }
                );
            } else {
                console.warn("[OPS TICKET] Failed to create:", await res.text());
            }
        } catch (e) {
            console.error("[OPS TICKET] Error:", e);
        }
    };

    const generateAiReply = async (
        conversation: SimulatedConversation,
        sessionId: string,
        onComplete: (finalReply: string) => void
    ): Promise<void> => {
        const res = await fetch("/api/hostaway/suggest-reply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: conversation.messages,
                guestName: conversation.guestName,
                propertyName: propertyName || "Our Property",
                listingId: propertyId,
                orgId: orgId,
                sessionId: sessionId,
                threadId: conversation.id
            })
        });

        if (!res.ok) throw new Error("Failed to call agent");

        const { jobId } = await res.json();

        // Animate graph stages while polling
        setGraphStages(prev => prev.map(s => s.id === "routing" ? { ...s, status: "active" } : s));
        pushGraphEvent({
            event_type: "tool_called",
            message: "Routing guest request...",
            thinking: "Analyzing guest intent...",
            status: "active",
            timestamp: new Date().toISOString(),
            iteration: 1,
        });

        const allStages = ["routing", "analyzing", "validating", "generating"];
        const result = await pollJob<{ message: string; raw_json?: Record<string, unknown> }>(jobId, {
            onPoll: (elapsed) => {
                const idx = Math.min(Math.floor(elapsed / 8000), allStages.length - 1);
                setGraphStages(prev => prev.map((s, i) => ({
                    ...s,
                    status: i < idx ? "done" : i === idx ? "active" : s.status,
                })));
            },
        });

        setGraphStages(prev => prev.map(s => ({ ...s, status: "done" })));
        setGraphFlowStatus("done");
        pushGraphEvent({
            event_type: "output_generated",
            message: "Response complete",
            status: "done",
            timestamp: new Date().toISOString(),
            iteration: 1,
        });

        let processedMessage = result.message;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let parsedJson: any = result.raw_json || null;

        if (!parsedJson && processedMessage && (processedMessage.includes("{") || processedMessage.includes("{\""))) {
            try {
                let cleanMessage = processedMessage.trim();
                if (cleanMessage.startsWith('"') && cleanMessage.endsWith('"') && cleanMessage.includes('\\"')) {
                    try { cleanMessage = JSON.parse(cleanMessage); } catch { cleanMessage = cleanMessage.replace(/^"|"$/g, ''); }
                }
                const unescaped = typeof cleanMessage === 'string'
                    ? cleanMessage.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\")
                    : cleanMessage;
                parsedJson = typeof unescaped === 'object' ? unescaped : JSON.parse(unescaped);
            } catch (e) {
                console.warn("[GUEST_AGENT] Frontend fallback parse failed:", e);
            }
        }

        if (parsedJson) {
            processedMessage =
                parsedJson.suggested_reply?.content ||
                parsedJson.chat_response ||
                parsedJson.reply ||
                parsedJson.message ||
                processedMessage;
        }

        if (parsedJson?.triage?.suggested_action === "ticket" && activeConversationId) {
            createOpsTicket(parsedJson, activeConversationId);
        }
        if (parsedJson?.triage?.suggested_action === "escalate" && activeConversationId) {
            createEscalation(parsedJson, activeConversationId);
        }

        onComplete(processedMessage);
        setIsGraphProcessing(false);
    };

    const handleAiSuggest = async () => {
        if (!activeConversationId) return;
        const conversation = conversations.find(c => c.id === activeConversationId);
        if (!conversation) return;

        setIsSuggesting(true);
        const runtimeSession = `guest-${activeConversationId}-${Date.now()}`;
        setGraphEvents([]);
        setGraphFlowStatus("active");
        setLastThinkingMessage(null);
        setGraphStages(GUEST_GRAPH_STAGES.map((s) => ({ ...s, status: "pending" })));
        setIsGraphProcessing(true);
        setShowLiveGraph(true);
        pushGraphEvent({ event_type: "agent_process_start", message: "Reading conversation...", thinking: "Analyzing guest context...", status: "active", timestamp: new Date().toISOString(), iteration: 1 });
        toast.loading("Agent is reading the full conversation...", { id: 'suggest' });

        try {
            await generateAiReply(
                conversation,
                runtimeSession,
                (finalReply) => {
                    setReplyText(finalReply);
                    toast.success("Agent drafted a suggested reply", { id: 'suggest' });
                }
            );
        } catch {
            pushGraphEvent({ event_type: "agent_error", message: "Reply generation failed.", status: "failed", timestamp: new Date().toISOString(), iteration: 1 });
            setGraphFlowStatus("failed");
            setGraphStages(prev => prev.map(s => ({ ...s, status: s.status === "done" ? "done" : "failed" })));
            toast.error("Failed to get Agent suggestion", { id: 'suggest' });
            setIsGraphProcessing(false);
        } finally {
            setIsSuggesting(false);
        }
    };

    // Auto-reply: when enabled, auto-generate + send a reply for any conversation
    // that needs a reply and hasn't been auto-replied yet in this session.
    useEffect(() => {
        if (!autoReplyEnabled || !activeConversationId) return;
        const conversation = conversations.find(c => c.id === activeConversationId);
        if (!conversation || conversation.status !== 'needs_reply') return;
        if (autoRepliedIds.current.has(activeConversationId)) return;

        autoRepliedIds.current.add(activeConversationId);

        (async () => {
            toast.loading(`Auto-replying to ${conversation.guestName}...`, { id: `auto-${activeConversationId}` });
            try {
                const runtimeSession = `auto-${activeConversationId}-${Date.now()}`;
                let finalReply = "";
                await generateAiReply(
                    conversation,
                    runtimeSession,
                    (reply) => { finalReply = reply; }
                );
                
                if (!finalReply) throw new Error("No reply generated");

                const res = await fetch("/api/hostaway/reply", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ conversationId: activeConversationId, text: finalReply })
                });
                if (!res.ok) throw new Error("Failed to save reply");

                setConversations(prev => prev.map(conv =>
                    conv.id === activeConversationId
                        ? { ...conv, status: 'resolved' as const, lastMessage: finalReply, messages: [...conv.messages, { id: Date.now().toString(), sender: 'admin' as const, text: finalReply, time: "Just now" }] }
                        : conv
                ));
                toast.success(`Auto-replied to ${conversation.guestName}`, { id: `auto-${activeConversationId}` });
            } catch {
                autoRepliedIds.current.delete(activeConversationId);
                toast.error(`Auto-reply failed for ${conversation.guestName}`, { id: `auto-${activeConversationId}` });
            }
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoReplyEnabled, activeConversationId]);

    const handleSendReply = async () => {
        if (!replyText.trim() || !activeConversationId) return;
        const textToSave = replyText;
        const convId = activeConversationId;
        setReplyText("");
        setGraphEvents([]);
        setGraphFlowStatus("active");
        setLastThinkingMessage(null);
        setGraphStages(GUEST_GRAPH_STAGES.map((s) => ({ ...s, status: "pending" })));
        setIsGraphProcessing(true);
        setShowLiveGraph(true);

        try {
            pushGraphEvent({ event_type: "agent_process_start", message: "Sending guest reply...", thinking: "Validating and storing reply.", status: "active", timestamp: new Date().toISOString(), iteration: 1 });
            const res = await fetch("/api/hostaway/reply", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ conversationId: convId, text: textToSave })
            });

            if (!res.ok) throw new Error("Failed to save to DB");

            setConversations(prev => prev.map(conv => {
                if (conv.id === convId) {
                    return {
                        ...conv,
                        status: 'resolved' as const,
                        lastMessage: textToSave,
                        messages: [
                            ...conv.messages,
                            { id: Date.now().toString(), sender: 'admin' as const, text: textToSave, time: "Just now" }
                        ]
                    };
                }
                return conv;
            }));

            pushGraphEvent({ event_type: "process_complete", message: "Reply saved successfully.", status: "completed", timestamp: new Date().toISOString(), iteration: 1 });
            setGraphFlowStatus("done");
            setGraphStages((prev) => prev.map((s) => ({ ...s, status: "done" })));
            toast.success("Reply securely saved to shadow database", { id: 'reply' });
        } catch (error) {
            setReplyText(textToSave);
            pushGraphEvent({ event_type: "agent_error", message: "Reply save failed.", status: "failed", timestamp: new Date().toISOString(), iteration: 1 });
            setGraphFlowStatus("failed");
            setGraphStages((prev) => prev.map((s) => ({ ...s, status: "failed" })));
            toast.error("Failed to save shadow reply", { id: 'reply' });
        } finally {
            setIsGraphProcessing(false);
        }
    };

    const handleSimulateGuestMessage = async () => {
        if (!replyText.trim() || !activeConversationId || !propertyId) return;
        const textToSave = replyText;
        const convId = activeConversationId;
        setReplyText("");
        
        toast.loading("Simulating guest message...", { id: 'simulate' });
        try {
            const res = await fetch("/api/guest-agent/simulate-guest-message", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    threadId: convId, 
                    orgId: propertyId, // Using listingId as org proxy or we need real orgId
                    content: textToSave 
                })
            });

            if (!res.ok) throw new Error("Simulation failed");

            // Update local state to show the message as INBOUND
            setConversations(prev => prev.map(conv => {
                if (conv.id === convId) {
                    return {
                        ...conv,
                        status: 'needs_reply' as const,
                        lastMessage: textToSave,
                        messages: [
                            ...conv.messages,
                            { id: Date.now().toString(), sender: 'guest' as const, text: textToSave, time: "Just now" }
                        ]
                    };
                }
                return conv;
            }));

            toast.success("Guest message simulated! Maya is now processing...", { id: 'simulate' });
            
            // Automatically trigger the agent logic
            handleAiSuggest();
        } catch (error) {
            setReplyText(textToSave);
            toast.error("Failed to simulate guest message", { id: 'simulate' });
        }
    };

    const handleTestSend = async () => {
        if (!testInput.trim() || isTestRunning) return;
        const msgText = testInput.trim();
        setTestInput("");
        const guestMsg = { id: `tg-${Date.now()}`, text: msgText, sender: "guest" as const, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
        setTestMessages(prev => [...prev, guestMsg]);
        setTimeout(() => testScrollRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        setIsTestRunning(true);

        const runtimeSession = `guest-test-${Date.now()}`;
        setGraphEvents([]);
        setGraphFlowStatus("active");
        setLastThinkingMessage(null);
        setGraphStages(GUEST_GRAPH_STAGES.map(s => ({ ...s, status: "pending" as const })));
        setIsGraphProcessing(true);
        setShowLiveGraph(true);

        // Create a real GuestThread so the agent receives a valid MongoDB ObjectId.
        // Without this, the Lyzr agent gets a synthetic "test-{timestamp}" ID which
        // causes a 400 on every send_reply tool call.
        let realThreadId = `test-${Date.now()}`;
        try {
            const threadRes = await fetch("/api/guest-agent/threads", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    orgId,
                    guestName: "Test Guest",
                    listingId: propertyId || undefined,
                    channel: "internal",
                }),
            });
            if (threadRes.ok) {
                const threadData = await threadRes.json();
                realThreadId = threadData.threadId;
            }
        } catch {
            // Fall back to synthetic ID — send_reply handles it gracefully
        }

        const mockConversation: SimulatedConversation = {
            id: realThreadId,
            guestName: "Test Guest",
            lastMessage: msgText,
            status: "needs_reply",
            messages: [
                ...testMessages.map(m => ({ ...m, sender: (m.sender === "agent" ? "admin" : m.sender) as "guest" | "admin" })),
                { ...guestMsg, sender: "guest" as const },
            ],
        };

        try {
            await generateAiReply(
                mockConversation,
                runtimeSession,
                (finalReply) => {
                    const agentMsg = {
                        id: `ta-${Date.now()}`,
                        text: finalReply || "Agent couldn't generate a reply. Please try again.",
                        sender: "agent" as const,
                        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                    };
                    setTestMessages(prev => [...prev, agentMsg]);
                    setTimeout(() => testScrollRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
                }
            );
        } catch {
            toast.error("Test agent failed to respond.");
            setIsGraphProcessing(false);
        } finally {
            setIsTestRunning(false);
        }
    };

    const handleClearTestChat = () => {
        setTestMessages([]);
        setGraphEvents([]);
        setGraphFlowStatus("pending");
        setLastThinkingMessage(null);
        setGraphStages(GUEST_GRAPH_STAGES.map(s => ({ ...s, status: "pending" as const })));
        setShowLiveGraph(false);
        toast.success("Test session reset");
    };

    const activeConversation = conversations.find(c => c.id === activeConversationId);
    const structuredSummary =
        conversationSummary && typeof conversationSummary === "object"
            ? (conversationSummary as {
                  sentiment?: string;
                  themes?: string[];
                  actionItems?: string[];
                  bulletPoints?: string[];
                  totalConversations?: number;
                  needsReplyCount?: number;
              })
            : null;

    if (contextType === "portfolio") {
        return (
            <div className="flex flex-col flex-1 items-center justify-center h-full text-muted-foreground p-8 text-center bg-muted/5">
                <Building2 className="h-16 w-16 mb-6 opacity-10" />
                <h3 className="text-xl font-bold text-foreground">Select a Property</h3>
                <p className="mt-2 text-sm max-w-sm">
                    Please select a property from the sidebar to view guest conversations and use the AI Inbox Analyst.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col flex-1 overflow-hidden h-full">
            {/* Standard Header */}
            <div className="border-b bg-background flex flex-col shrink-0 relative z-10 shadow-sm">
                <div className="flex flex-wrap items-center justify-between px-6 py-4 gap-4">
                    <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-emerald-500/10 p-2">
                            <MessageSquare className="h-5 w-5 text-emerald-600" />
                        </div>
                        <div>
                            <h3 className="text-lg font-black tracking-tight">
                                Guest Inbox
                            </h3>
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                                {propertyName || "Property Communications"}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-9 gap-2 bg-background hover:bg-background/80 border-border/50 font-bold shadow-sm"
                            onClick={() => setShowLiveGraph((v) => !v)}
                        >
                            <Activity className="h-4 w-4" />
                            <span className="hidden sm:inline">{showLiveGraph ? "Hide Graph" : "Live Graph"}</span>
                        </Button>
                        {/* Auto-Reply Toggle */}
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${autoReplyEnabled ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-muted/30 border-border/50'}`}>
                            <Zap className={`h-3.5 w-3.5 transition-colors ${autoReplyEnabled ? 'text-emerald-500' : 'text-muted-foreground'}`} />
                            <span className={`text-xs font-bold tracking-wide hidden sm:inline transition-colors ${autoReplyEnabled ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                                {autoReplyEnabled ? 'Auto-Reply ON' : 'Auto-Reply'}
                            </span>
                            <Switch
                                checked={autoReplyEnabled}
                                onCheckedChange={(v) => {
                                    setAutoReplyEnabled(v);
                                    if (v) {
                                        autoRepliedIds.current.clear();
                                        toast.success("Auto-Reply enabled — AI will reply to new messages automatically", { duration: 3000 });
                                    } else {
                                        toast.info("Auto-Reply disabled");
                                    }
                                }}
                                className="h-4 w-8 data-[state=checked]:bg-emerald-500"
                            />
                        </div>

                        {/* Simulation Mode Toggle */}
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${isSimulationMode ? 'bg-blue-500/10 border-blue-500/40' : 'bg-muted/30 border-border/50'}`}>
                            <User className={`h-3.5 w-3.5 transition-colors ${isSimulationMode ? 'text-blue-500' : 'text-muted-foreground'}`} />
                            <span className={`text-xs font-bold tracking-wide hidden sm:inline transition-colors ${isSimulationMode ? 'text-blue-600' : 'text-muted-foreground'}`}>
                                {isSimulationMode ? 'Test Mode: Guest' : 'Normal Mode'}
                            </span>
                            <Switch
                                checked={isSimulationMode}
                                onCheckedChange={(v) => {
                                    setIsSimulationMode(v);
                                    if (v) {
                                        toast.info("Simulation Mode Enabled: You are now typing as the GUEST", { duration: 3000 });
                                    } else {
                                        toast.info("Switched back to Host Mode");
                                    }
                                }}
                                className="h-4 w-8 data-[state=checked]:bg-blue-500"
                            />
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                                if (!propertyId) return;
                                setIsGeneratingSummary(true);
                                try {
                                    toast.loading("AI is generating summary...", { id: 'summary' });
                                    const res = await fetch(`/api/hostaway/summary`, {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ listingId: propertyId })
                                    });
                                    if (res.ok) {
                                        const data = await res.json();
                                        setConversationSummary(data.summary);
                                        toast.success("Summary generated & saved!", { id: 'summary' });
                                    } else {
                                        throw new Error("Failed");
                                    }
                                } catch (e) {
                                    toast.error("Failed to generate summary", { id: 'summary' });
                                } finally {
                                    setIsGeneratingSummary(false);
                                }
                            }}
                            disabled={isGeneratingSummary || conversations.length === 0}
                            className="h-9 gap-2 bg-background hover:bg-background/80 border-border/50 font-bold shadow-sm text-violet-600 border-violet-500/30"
                        >
                            {isGeneratingSummary ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                            <span className="hidden sm:inline">{isGeneratingSummary ? 'Generating...' : 'Generate Summary'}</span>
                        </Button>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden min-w-0">
                {/* Guest Inbox Sidebar — collapsible */}
                <div className={`border-r bg-muted/10 flex flex-col border-border/50 transition-all duration-200 shrink-0 ${isInboxCollapsed ? 'w-0 overflow-hidden border-r-0' : activeConversationId ? 'hidden md:flex w-[320px] lg:w-[360px]' : 'flex w-[320px] lg:w-[360px]'}`}>
                    <div className="p-4 border-b bg-background border-border/50 flex items-center justify-between">
                        <h3 className="font-black uppercase tracking-widest text-xs text-muted-foreground">Guest Inbox</h3>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[10px] gap-1"
                                onClick={syncFromHostaway}
                                disabled={isSyncingHostaway || !propertyId}
                            >
                                {isSyncingHostaway ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                    <CloudDownload className="h-3 w-3" />
                                )}
                                Hostaway
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-full hover:bg-muted"
                                onClick={() => fetchConversations(true)}
                                disabled={isLoading || !propertyId}
                            >
                                <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-full hover:bg-muted"
                                onClick={() => setIsInboxCollapsed(true)}
                            >
                                <PanelLeftClose className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {conversations.map(conv => (
                            <button
                                key={conv.id}
                                onClick={() => {
                                    if (activeConversationId === conv.id) {
                                        // Deselect: clicking the active conversation clears it
                                        setActiveConversationId(null);
                                        setHighlightConversationId(null);
                                    } else {
                                        setActiveConversationId(conv.id);
                                        setHighlightConversationId(conv.id);
                                    }
                                }}
                                className={`w-full text-left p-3 rounded-xl transition-all border ${
                                    highlightConversationId === conv.id
                                        ? 'bg-primary/10 border-primary/50 ring-1 ring-primary/30'
                                        : activeConversationId === conv.id
                                            ? 'bg-primary/5 border-primary/30'
                                            : 'bg-background hover:bg-muted/50 border-border/50 hover:border-border'
                                }`}
                            >
                                <div className="flex items-start gap-3">
                                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                                        <User className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <div className="flex flex-col min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-sm font-bold truncate">{conv.guestName}</span>
                                            {conv.status === 'needs_reply' && (
                                                <span className="shrink-0 inline-flex items-center justify-center h-4 min-w-[1rem] px-1 rounded-full bg-primary text-[9px] font-black text-white leading-none">
                                                    {(conv.unreadCount ?? 0) > 9 ? "9+" : (conv.unreadCount ?? 1)}
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-xs text-muted-foreground truncate font-medium mt-0.5">{conv.lastMessage}</span>
                                    </div>
                                </div>
                            </button>
                        ))}
                        {conversations.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground">
                                <User className="h-8 w-8 mx-auto mb-2 opacity-20" />
                                <p className="text-xs font-medium">No conversations</p>
                                <p className="text-[10px] mt-1 text-center px-4">No cached conversation threads yet.<br />Sync from Dashboard if needed.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Expand button when inbox is collapsed */}
                {isInboxCollapsed && (
                    <div className="flex flex-col items-center py-3 px-1 border-r border-border/50 bg-muted/10">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-full hover:bg-muted"
                            onClick={() => setIsInboxCollapsed(false)}
                        >
                            <PanelLeftOpen className="h-3.5 w-3.5 text-slate-400" />
                        </Button>
                    </div>
                )}

                <div className={`flex-1 min-w-0 flex flex-col bg-background relative ${!activeConversationId ? 'hidden md:flex' : 'flex'}`}>

                    {activeConversation ? (
                        <>
                            <div className="flex items-center p-4 border-b border-border/50 bg-background shadow-sm z-10">
                                <div className="flex items-center gap-3">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 -ml-2 rounded-full hover:bg-muted md:hidden"
                                        onClick={() => setActiveConversationId(null)}
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold leading-none">{activeConversation.guestName}</span>
                                        <span className="text-[10px] text-muted-foreground uppercase font-black tracking-widest mt-1">Hostaway Guest</span>
                                    </div>
                                </div>
                            </div>
                            <div className={`flex-1 min-w-0 overflow-y-auto p-4 md:p-6 space-y-4 transition-colors ${
                                highlightConversationId === activeConversationId ? 'bg-primary/5' : ''
                            }`}>
                                {activeConversation.messages.map((msg) => (
                                    <div key={msg.id} className={`flex flex-col max-w-[92%] md:max-w-[85%] ${msg.sender === 'admin' ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
                                        <div className={`px-4 py-2.5 rounded-2xl overflow-hidden ${msg.sender === 'admin' ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted border border-border/50 rounded-bl-sm'}`}>
                                            <p className="text-sm leading-relaxed whitespace-pre-wrap break-all">{msg.text}</p>
                                        </div>
                                        <span className="text-[9px] font-bold text-muted-foreground mt-1 px-1 tracking-wider uppercase">{msg.time}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="p-4 bg-background border-t border-border/50 shrink-0 relative z-10">
                                <div className="flex items-center gap-2">
                                    <div className="relative flex-1 flex items-center">
                                        <input
                                            type="text"
                                            value={replyText}
                                            onChange={(e) => setReplyText(e.target.value)}
                                            onKeyDown={(e) => { 
                                                if (e.key === 'Enter') {
                                                    if (isSimulationMode) handleSimulateGuestMessage();
                                                    else handleSendReply();
                                                } 
                                            }}
                                            placeholder={isSimulationMode ? "Type a guest inquiry (e.g. Wifi password?)..." : `Reply to ${activeConversation.guestName}...`}
                                            className={cn(
                                                "w-full border rounded-full pl-4 pr-10 h-10 text-sm focus:outline-none focus:ring-2 transition-all font-medium placeholder:font-normal",
                                                isSimulationMode 
                                                    ? "bg-blue-500/5 border-blue-500/30 focus:ring-blue-500/20" 
                                                    : "bg-muted/50 border-border/50 focus:ring-primary/20"
                                            )}
                                        />
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={handleAiSuggest}
                                            disabled={isSuggesting}
                                            className={`absolute right-1.5 h-7 w-7 rounded-full transition-all ${isSuggesting ? 'text-primary' : 'text-muted-foreground hover:text-primary hover:bg-primary/50'}`}
                                        >
                                            {isSuggesting ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                                <Sparkles className="h-3.5 w-3.5" />
                                            )}
                                        </Button>
                                    </div>
                                    <Button
                                        size="icon"
                                        onClick={isSimulationMode ? handleSimulateGuestMessage : handleSendReply}
                                        disabled={!replyText.trim()}
                                        className={cn(
                                            "h-10 w-10 rounded-full shrink-0 shadow-md",
                                            isSimulationMode ? "bg-blue-500 hover:bg-blue-600" : ""
                                        )}
                                    >
                                        <Send className="h-4 w-4" />
                                    </Button>
                                </div>
                                <p className="text-[9px] text-center text-muted-foreground/50 mt-2 font-bold uppercase tracking-widest">
                                    {isSimulationMode ? "Simulated Inbound Message (Admin as Guest)" : "Sending securely via shadow database"}
                                </p>
                            </div>
                        </>
                    ) : isSimulationMode ? (
                        <div className="flex-1 flex flex-col bg-blue-500/5 relative min-h-0">
                            {/* Test mode header */}
                            <div className="bg-blue-50/80 border-b border-blue-100 px-6 py-3 flex items-center justify-between sticky top-0 z-20 backdrop-blur-sm">
                                <div className="flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                        <Bot className="h-4 w-4 text-blue-600" />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-black text-blue-900 tracking-tight">Agent Test Mode</h4>
                                        <p className="text-[10px] font-bold text-blue-600/70 uppercase tracking-wider">Type any guest query — the AI agent will respond as if it's a real guest message</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleClearTestChat}
                                        className="h-8 gap-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 font-bold text-xs"
                                    >
                                        <RefreshCw className="h-3.5 w-3.5" />
                                        <span className="hidden sm:inline">New Chat</span>
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setIsGraphProcessing(false);
                                            setShowLiveGraph(false);
                                        }}
                                        className="h-8 w-8 p-0 text-blue-400 hover:text-blue-600 hover:bg-blue-50"
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            {/* Messages area */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                {testMessages.length === 0 && (
                                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 pt-8">
                                        <Bot className="h-10 w-10 opacity-20" />
                                        <p className="text-sm font-medium">No messages yet</p>
                                        <p className="text-xs text-center max-w-xs">Type a guest question below (e.g. "What's the WiFi password?") to test the AI agent response.</p>
                                    </div>
                                )}
                                {testMessages.map((msg) => (
                                    <div key={msg.id} className={`flex flex-col max-w-[85%] ${msg.sender === "agent" ? "mr-auto items-start" : "ml-auto items-end"}`}>
                                        <div className={`px-4 py-2.5 rounded-2xl overflow-hidden ${msg.sender === "agent" ? "bg-muted border border-blue-500/20 rounded-bl-sm" : "bg-blue-500 text-white rounded-br-sm"}`}>
                                            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>
                                        </div>
                                        <span className="text-[9px] font-bold text-muted-foreground mt-1 px-1 tracking-wider uppercase">
                                            {msg.sender === "agent" ? "AI Agent" : "You (as Guest)"} · {msg.time}
                                        </span>
                                    </div>
                                ))}
                                {isTestRunning && (
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                                        <span className="text-xs">Agent is generating reply…</span>
                                    </div>
                                )}
                                <div ref={testScrollRef} />
                            </div>

                            {/* Test input */}
                            <div className="p-4 bg-background border-t border-blue-500/20 shrink-0">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={testInput}
                                        onChange={e => setTestInput(e.target.value)}
                                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) handleTestSend(); }}
                                        placeholder="Type a guest query to test the agent…"
                                        disabled={isTestRunning}
                                        className="flex-1 border border-blue-500/30 rounded-full pl-4 pr-4 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-blue-500/5 placeholder:text-muted-foreground/50 disabled:opacity-50"
                                    />
                                    <Button
                                        size="icon"
                                        onClick={handleTestSend}
                                        disabled={!testInput.trim() || isTestRunning}
                                        className="h-10 w-10 rounded-full shrink-0 bg-blue-500 hover:bg-blue-600"
                                    >
                                        {isTestRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                    </Button>
                                </div>
                                <p className="text-[9px] text-center text-blue-500/50 mt-2 font-bold uppercase tracking-widest">
                                    Simulated Guest Query — Testing AI Agent Responses
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                            <User className="h-12 w-12 mb-4 opacity-10" />
                            <p className="text-sm font-medium">No conversation selected</p>
                            <p className="text-xs mt-1">Select a guest from the list to view or reply.</p>
                        </div>
                    )}
                </div>

                {/* Right Sidebar Summary Panel */}
                <div
                    className={`hidden 2xl:flex border-l border-border/50 bg-muted/10 transition-all duration-200 shrink-0 ${
                        isSummaryCollapsed ? "w-12 p-2" : "w-[300px] p-3"
                    }`}
                >
                    {isSummaryCollapsed ? (
                        <div className="flex w-full flex-col items-center pt-2">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-full hover:bg-muted"
                                onClick={() => setIsSummaryCollapsed(false)}
                            >
                                <ChevronLeft className="h-3.5 w-3.5 text-slate-400" />
                            </Button>
                        </div>
                    ) : (
                        <div className="w-full min-w-0 rounded-2xl border border-border/50 bg-background shadow-sm p-4 space-y-3 h-fit overflow-hidden">
                            <div className="flex items-center justify-between gap-2">
                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-600">
                                    Conversation Summary
                                </h4>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 rounded-full hover:bg-muted shrink-0"
                                    onClick={() => setIsSummaryCollapsed(true)}
                                >
                                    <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                                </Button>
                            </div>

                            {activeConversation ? (
                                <>
                                    <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                                            {activeConversation.guestName}
                                        </p>
                                        <p className="text-[11px] text-foreground/90 line-clamp-4 break-words">
                                            {activeConversation.lastMessage || "No message preview available."}
                                        </p>
                                    </div>

                                    {structuredSummary ? (
                                        <>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="rounded-lg border border-border/50 p-2">
                                                    <p className="text-[9px] uppercase text-muted-foreground">Sentiment</p>
                                                    <p className="text-[11px] font-semibold mt-1">{structuredSummary.sentiment || "—"}</p>
                                                </div>
                                                <div className="rounded-lg border border-border/50 p-2">
                                                    <p className="text-[9px] uppercase text-muted-foreground">Needs Reply</p>
                                                    <p className="text-[11px] font-semibold mt-1">{structuredSummary.needsReplyCount ?? 0}</p>
                                                </div>
                                            </div>
                                            {!!structuredSummary.themes?.length && (
                                                <div className="rounded-lg border border-border/50 p-2">
                                                    <p className="text-[9px] uppercase text-muted-foreground mb-1">Themes</p>
                                                    <p className="text-[11px] text-foreground/90 line-clamp-3 break-words">
                                                        {structuredSummary.themes.join(", ")}
                                                    </p>
                                                </div>
                                            )}
                                            {!!structuredSummary.actionItems?.length && (
                                                <div className="rounded-lg border border-border/50 p-2">
                                                    <p className="text-[9px] uppercase text-muted-foreground mb-1">Action Items</p>
                                                    <p className="text-[11px] text-foreground/90 line-clamp-4 break-words">
                                                        {structuredSummary.actionItems.join(" • ")}
                                                    </p>
                                                </div>
                                            )}
                                        </>
                                    ) : null}
                                </>
                            ) : (
                                <p className="text-[11px] text-muted-foreground">
                                    Select a conversation to view its summary.
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

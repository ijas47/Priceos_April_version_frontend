"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MarketEventsTable } from "@/components/events/market-events-table";
import { BenchmarkWidget } from "@/components/signals/benchmark-widget";
import { MarketOverviewWidget } from "@/components/signals/market-overview-widget";
import { DemandPacingWidget } from "@/components/signals/demand-pacing-widget";
import { CalendarVisualizer } from "@/components/chat/calendar-visualizer";
import { useContextStore } from "@/stores/context-store";
import {
    Sparkles, Calendar, Activity,
    ChevronLeft, Send, User,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { formatRateForLabel } from "@/lib/pricing/display-rate";

interface SimulatedConversation {
    id: string;
    guestName: string;
    lastMessage: string;
    status: 'needs_reply' | 'resolved';
    messages: { id: string; sender: 'guest' | 'admin'; text: string; time: string }[];
}

const mockConversations: SimulatedConversation[] = [
    {
        id: "conv_1",
        guestName: "John Doe",
        lastMessage: "Is the pool heated during March?",
        status: "needs_reply",
        messages: [
            { id: "m1", sender: "guest", text: "Hi, I have a quick question before booking.", time: "10:00 AM" },
            { id: "m2", sender: "admin", text: "Hello John, absolutely! How can I help?", time: "10:15 AM" },
            { id: "m3", sender: "guest", text: "Is the pool heated during March?", time: "10:20 AM" }
        ]
    },
    {
        id: "conv_2",
        guestName: "Sarah Smith",
        lastMessage: "Thank you for the parking instructions!",
        status: "resolved",
        messages: [
            { id: "m1", sender: "guest", text: "Where exactly is the parking spot?", time: "Yesterday" },
            { id: "m2", sender: "admin", text: "It is spot #42 in the underground garage.", time: "Yesterday" },
            { id: "m3", sender: "guest", text: "Thank you for the parking instructions!", time: "Yesterday" }
        ]
    }
];

export function SidebarTabbedView() {
    const {
        activeSidebarTab,
        setSidebarTab,
        calendarMetrics,
        dateRange,
        contextType,
        propertyId,
        marketRefreshTrigger,
        propertyCurrency,
    } = useContextStore();

    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [replyText, setReplyText] = useState("");
    const [conversations, setConversations] = useState<SimulatedConversation[]>(mockConversations);

    const showData = contextType === "property" && propertyId;
    const showCalendar = showData && calendarMetrics?.calendarDays;

    const handleSendReply = () => {
        if (!replyText.trim() || !activeConversationId) return;

        setConversations(prev => prev.map(conv => {
            if (conv.id === activeConversationId) {
                return {
                    ...conv,
                    status: 'resolved' as const,
                    lastMessage: replyText,
                    messages: [
                        ...conv.messages,
                        { id: Date.now().toString(), sender: 'admin' as const, text: replyText, time: "Just now" }
                    ]
                };
            }
            return conv;
        }));

        setReplyText("");
    };

    const activeConversation = conversations.find(c => c.id === activeConversationId);

    return (
        <div className="flex flex-col h-full bg-background overflow-hidden relative">
            <Tabs
                value={activeSidebarTab}
                onValueChange={(val) => setSidebarTab(val as "summary" | "signals" | "calendar")}
                className="flex flex-col h-full"
            >
                <div className="px-4 pt-4 border-b bg-muted/5 shrink-0 z-10">
                    <TabsList className="grid w-full grid-cols-3 h-11 p-1 bg-muted/50 rounded-lg">
                        <TabsTrigger value="summary" className="flex flex-col items-center justify-center gap-0.5 px-0 text-[8px] sm:text-[9px] font-black uppercase tracking-wider">
                            <Activity className="h-3.5 w-3.5" />
                            <span className="truncate w-full text-center">Summary</span>
                        </TabsTrigger>
                        <TabsTrigger value="signals" className="flex flex-col items-center justify-center gap-0.5 px-0 text-[8px] sm:text-[9px] font-black uppercase tracking-wider">
                            <Sparkles className="h-3.5 w-3.5" />
                            <span className="truncate w-full text-center">Signals</span>
                        </TabsTrigger>
                        <TabsTrigger value="calendar" className="flex flex-col items-center justify-center gap-0.5 px-0 text-[8px] sm:text-[9px] font-black uppercase tracking-wider">
                            <Calendar className="h-3.5 w-3.5" />
                            <span className="truncate w-full text-center">Calendar</span>
                        </TabsTrigger>
                    </TabsList>
                </div>

                <div className="flex-1 overflow-hidden relative">
                    <TabsContent value="summary" className="h-full m-0 overflow-hidden focus-visible:ring-0">
                        {showData ? (
                            activeConversation ? (
                                // Active Conversation Chat View
                                <div className="flex flex-col h-full bg-muted/5 animate-in slide-in-from-right-4 duration-300">
                                    <div className="flex items-center justify-between p-4 border-b bg-background shadow-sm z-10">
                                        <div className="flex items-center gap-3">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 -ml-2 rounded-full hover:bg-muted"
                                                onClick={() => setActiveConversationId(null)}
                                            >
                                                <ChevronLeft className="h-4 w-4" />
                                            </Button>
                                            <div className="flex items-center gap-2.5">
                                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                                    <User className="h-4 w-4" />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold leading-none">{activeConversation.guestName}</span>
                                                    <span className="text-[10px] text-muted-foreground uppercase font-black tracking-widest mt-1">Hostaway Guest</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                        {activeConversation.messages.map((msg) => (
                                            <div key={msg.id} className={`flex flex-col max-w-[85%] ${msg.sender === 'admin' ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
                                                <div className={`px-4 py-2.5 rounded-2xl ${msg.sender === 'admin' ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted border border-border/50 rounded-bl-sm'}`}>
                                                    <p className="text-sm leading-relaxed">{msg.text}</p>
                                                </div>
                                                <span className="text-[9px] font-bold text-muted-foreground mt-1 px-1 tracking-wider uppercase">{msg.time}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="p-4 bg-background border-t shrink-0">
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={replyText}
                                                onChange={(e) => setReplyText(e.target.value)}
                                                onKeyDown={(e) => { if (e.key === 'Enter') handleSendReply(); }}
                                                placeholder={`Reply to ${activeConversation.guestName}...`}
                                                className="flex-1 bg-muted/50 border border-border/50 rounded-full px-4 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium placeholder:font-normal"
                                            />
                                            <Button
                                                size="icon"
                                                onClick={handleSendReply}
                                                disabled={!replyText.trim()}
                                                className="h-10 w-10 rounded-full shrink-0 shadow-md"
                                            >
                                                <Send className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        <p className="text-[9px] text-center text-muted-foreground/50 mt-2 font-bold uppercase tracking-widest">
                                            Messages sync to Hostaway inbox
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                // Summary Main View
                                <div className="h-full overflow-y-auto p-4 flex flex-col gap-4">
                                    <div className="flex items-center gap-5 sm:gap-6 bg-muted/30 border border-border/50 px-6 py-5 rounded-2xl shrink-0 justify-between">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Occupancy</span>
                                            <div className="flex items-baseline gap-1 mt-1">
                                                {!calendarMetrics ? (
                                                    <span className="text-3xl font-bold text-muted-foreground/30 animate-pulse">--</span>
                                                ) : (
                                                    <span className={`text-3xl font-black tracking-tighter ${calendarMetrics.occupancy >= 70 ? 'text-emerald-500' : calendarMetrics.occupancy >= 40 ? 'text-primary' : 'text-rose-500'}`}>
                                                        {calendarMetrics.occupancy}%
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="h-12 w-px bg-border/50" />
                                        <div className="flex flex-col items-end">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{calendarMetrics?.rateLabel ?? "Listed Rate"}</span>
                                            <div className="flex items-baseline gap-1 mt-1">
                                                {!calendarMetrics ? (
                                                    <span className="text-3xl font-bold text-muted-foreground/30 animate-pulse">--</span>
                                                ) : (
                                                    <><span className="text-3xl font-black tracking-tighter">{formatRateForLabel(calendarMetrics.rateLabel, calendarMetrics).toFixed(0)}</span><span className="text-[12px] font-bold text-muted-foreground mb-0.5 ml-1">{propertyCurrency}</span></>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-center p-8 text-muted-foreground">
                                <Activity className="h-12 w-12 mb-4 opacity-10" />
                                <p className="text-sm font-medium">Select a Property</p>
                                <p className="text-xs mt-1">Choose a property from the context panel to view its summary.</p>
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="signals" className="h-full m-0 p-0 overflow-auto focus-visible:ring-0">
                        <div className="flex flex-col gap-0">
                            <MarketEventsTable />
                            <div className="px-3 pb-3 mt-3">
                                <MarketOverviewWidget
                                    month={dateRange?.from ? format(dateRange.from, "yyyy-MM") : format(new Date(), "yyyy-MM")}
                                    currency={propertyCurrency}
                                />
                                <DemandPacingWidget
                                    dateFrom={dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : null}
                                    dateTo={dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : null}
                                    currency={propertyCurrency}
                                />
                                <BenchmarkWidget
                                    listingId={propertyId ?? null}
                                    dateFrom={dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : null}
                                    dateTo={dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : null}
                                    refreshKey={marketRefreshTrigger}
                                    currency={propertyCurrency}
                                />
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="calendar" className="h-full m-0 p-0 overflow-auto focus-visible:ring-0">
                        {showCalendar ? (
                            <div className="p-4">
                                <CalendarVisualizer
                                    days={calendarMetrics.calendarDays}
                                    reservations={calendarMetrics.reservations || []}
                                    dateRange={{
                                        from: format(dateRange?.from || new Date(), 'yyyy-MM-dd'),
                                        to: format(dateRange?.to || new Date(), 'yyyy-MM-dd')
                                    }}
                                />
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-center p-8 text-muted-foreground">
                                <Calendar className="h-12 w-12 mb-4 opacity-10" />
                                <p className="text-sm font-medium">Calendar Data Unavailable</p>
                                <p className="text-xs mt-1">Select a property and date range to view availability.</p>
                            </div>
                        )}
                    </TabsContent>

                </div>
            </Tabs>
        </div>
    );
}

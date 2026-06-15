"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, MessageSquare } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import type { EventSignal } from "@/data/mock-events";

interface EventCardProps {
  event: EventSignal;
}

export function EventCard({ event }: EventCardProps) {
  const { open } = useChatStore();

  const impactColors = {
    low: "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400",
    medium: "border-primary/80 bg-primary/50 text-primary dark:border-primary/30 dark:bg-primary/950 dark:text-primary",
    high: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-400",
    extreme: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400",
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">{event.name}</h3>
            <p className="text-xs text-muted-foreground">{event.location}</p>
          </div>
          <Badge variant="outline" className={impactColors[event.demandImpact]}>
            {event.demandImpact}
          </Badge>
        </div>

        <p className="text-xs text-muted-foreground line-clamp-2">
          {event.description}
        </p>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="h-3 w-3" />
          {new Date(event.startDate).toLocaleDateString("en", { month: "short", day: "numeric" })}
          {" - "}
          {new Date(event.endDate).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}
        </div>

        <p className="text-xs text-muted-foreground">{event.demandNotes}</p>

        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="text-xs">
            {event.category}
          </Badge>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 text-xs"
            onClick={() =>
              open(
                `How will ${event.name} (${event.startDate} to ${event.endDate}) affect my pricing? Impact level: ${event.demandImpact}`
              )
            }
          >
            <MessageSquare className="h-3 w-3" />
            Ask AI
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

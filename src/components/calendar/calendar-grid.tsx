"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { CalendarDay } from "@/types/hostaway";
import { useChatStore } from "@/stores/chat-store";
import { usePropertyStore } from "@/stores/property-store";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CalendarGridProps {
  days: CalendarDay[];
  onRefresh?: () => void;
}

const blockReasonLabels: Record<string, string> = {
  owner_stay: "Owner Stay",
  maintenance: "Maintenance",
  other: "Other",
};

export function CalendarGrid({ days, onRefresh }: CalendarGridProps) {
  const { open } = useChatStore();
  const { activeProperty } = usePropertyStore();
  const [blockReason, setBlockReason] = useState<string>("owner_stay");
  const [actionLoading, setActionLoading] = useState(false);

  const handleBlock = async (day: CalendarDay) => {
    if (!activeProperty) return;
    setActionLoading(true);
    try {
      await fetch("/api/calendar/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: activeProperty.id,
          startDate: day.date,
          endDate: day.date,
          reason: blockReason,
        }),
      });
      onRefresh?.();
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnblock = async (day: CalendarDay) => {
    if (!activeProperty) return;
    setActionLoading(true);
    try {
      await fetch("/api/calendar/unblock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: activeProperty.id,
          startDate: day.date,
          endDate: day.date,
        }),
      });
      onRefresh?.();
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-1">
      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div
            key={day}
            className="py-1 text-center text-xs font-medium text-muted-foreground"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const date = new Date(day.date + "T00:00:00");
          const isAvailable = day.status === "available";
          const isBooked = day.status === "booked";
          const isBlocked = day.status === "blocked";

          const cellContent = (
            <div
              className={cn(
                "flex flex-col items-center rounded-lg border p-1.5 text-xs transition-colors",
                isAvailable &&
                  "cursor-pointer border-green-200 bg-green-50 hover:bg-green-100 dark:border-green-900 dark:bg-green-950 dark:hover:bg-green-900",
                isBooked &&
                  "cursor-default border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950",
                isBlocked &&
                  "cursor-pointer border-primary/20 bg-primary/50 hover:bg-primary/100 dark:border-primary/900 dark:bg-primary/950 dark:hover:bg-primary/900"
              )}
            >
              <span className="font-medium">{date.getDate()}</span>
              <span className="text-[10px] text-muted-foreground">
                {date.toLocaleDateString("en", { month: "short" })}
              </span>
              {isAvailable && (
                <span className="mt-0.5 font-medium text-green-700 dark:text-green-400">
                  {day.price}
                </span>
              )}
              {isBooked && (
                <span className="mt-0.5 text-red-600 dark:text-red-400">
                  Booked
                </span>
              )}
              {isBlocked && (
                <span className="mt-0.5 text-primary dark:text-primary text-[10px]">
                  {day.blockReason ? blockReasonLabels[day.blockReason] : "Blocked"}
                </span>
              )}
            </div>
          );

          // Booked dates are not interactive
          if (isBooked) {
            return <div key={day.date}>{cellContent}</div>;
          }

          return (
            <Popover key={day.date}>
              <PopoverTrigger asChild>
                <button className="text-left">{cellContent}</button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-3" side="top">
                {isAvailable ? (
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Block this date</p>
                    <Select value={blockReason} onValueChange={setBlockReason}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner_stay">Owner Stay</SelectItem>
                        <SelectItem value="maintenance">Maintenance</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 h-7 text-xs"
                        disabled={actionLoading}
                        onClick={() => handleBlock(day)}
                      >
                        Block
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-7 text-xs"
                        onClick={() => {
                          const propertyName = activeProperty?.name ?? "this property";
                          open(
                            `What should I price ${propertyName} for ${date.toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" })}?`
                          );
                        }}
                      >
                        Ask AI
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium">Blocked</p>
                      {day.blockReason && (
                        <p className="text-xs text-muted-foreground">
                          Reason: {blockReasonLabels[day.blockReason] ?? day.blockReason}
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full h-7 text-xs"
                      disabled={actionLoading}
                      onClick={() => handleUnblock(day)}
                    >
                      Unblock
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          );
        })}
      </div>
    </div>
  );
}

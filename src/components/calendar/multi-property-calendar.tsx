"use client";

import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { CalendarDay, Listing } from "@/types/hostaway";

interface MultiPropertyCalendarProps {
  properties: Listing[];
  calendars: Record<number, CalendarDay[]>;
}

export function MultiPropertyCalendar({ properties, calendars }: MultiPropertyCalendarProps) {
  // Show 30 days
  const today = new Date();
  const dates: Date[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    dates.push(d);
  }

  const formatDate = (d: Date) => d.toISOString().split("T")[0];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-max min-w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="sticky left-0 z-10 bg-muted/50 px-3 py-2 text-left font-medium w-48 min-w-48">
                Property
              </th>
              {dates.map((d) => (
                <th
                  key={formatDate(d)}
                  className={cn(
                    "px-1 py-2 text-center font-medium min-w-8",
                    d.getDay() === 0 || d.getDay() === 6 ? "text-muted-foreground/60" : ""
                  )}
                >
                  <div>{d.toLocaleDateString("en", { weekday: "narrow" })}</div>
                  <div className="text-[10px]">{d.getDate()}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {properties.map((property) => {
              const cal = calendars[Number(property.id)] ?? [];
              const dayMap = new Map(cal.map((d) => [d.date, d]));

              return (
                <tr key={property.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="sticky left-0 z-10 bg-background px-3 py-1.5 font-medium truncate w-48 min-w-48">
                    <div className="truncate">{property.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{property.area}</div>
                  </td>
                  {dates.map((d) => {
                    const dateStr = formatDate(d);
                    const day = dayMap.get(dateStr);
                    const isAvailable = day?.status === "available";
                    const isBooked = day?.status === "booked";
                    const isBlocked = day?.status === "blocked";

                    return (
                      <td key={dateStr} className="px-0.5 py-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={cn(
                                "h-6 w-full rounded-sm",
                                isAvailable && "bg-green-200 dark:bg-green-900",
                                isBooked && "bg-red-300 dark:bg-red-800",
                                isBlocked && "bg-primary/20 dark:bg-primary/900",
                                !day && "bg-gray-100 dark:bg-gray-900"
                              )}
                            />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            <p className="font-medium">{property.name}</p>
                            <p>{dateStr}</p>
                            {day && (
                              <>
                                <p>Status: {day.status}</p>
                                {isAvailable && <p>Price: {day.price} AED</p>}
                                {isAvailable && <p>Min stay: {day.minimumStay} nights</p>}
                                {day.blockReason && <p>Reason: {day.blockReason.replace("_", " ")}</p>}
                              </>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  );
}

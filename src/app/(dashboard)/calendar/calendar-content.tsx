"use client";

import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CalendarGrid } from "@/components/calendar/calendar-grid";
import { MultiPropertyCalendar } from "@/components/calendar/multi-property-calendar";
import { usePropertyStore } from "@/stores/property-store";
import type { Listing, CalendarDay } from "@/types/hostaway";

interface CalendarContentProps {
  properties: Listing[];
  initialDays: CalendarDay[];
  defaultPropertyId: number;
  allCalendars?: Record<number, CalendarDay[]>;
}

export function CalendarContent({
  properties,
  initialDays,
  defaultPropertyId,
  allCalendars,
}: CalendarContentProps) {
  const [view, setView] = useState<"single" | "multi">("single");
  const [selectedPropertyId, setSelectedPropertyId] = useState(
    String(defaultPropertyId)
  );
  const [days, setDays] = useState(initialDays);
  const [loading, setLoading] = useState(false);
  const { setActiveProperty } = usePropertyStore();

  useEffect(() => {
    const property = properties.find((p) => p.id === Number(selectedPropertyId));
    if (property) setActiveProperty(property);
  }, [selectedPropertyId, properties, setActiveProperty]);

  const handlePropertyChange = async (value: string) => {
    setSelectedPropertyId(value);
    setLoading(true);
    try {
      const res = await fetch(`/api/calendar?propertyId=${value}`);
      if (res.ok) {
        const data = await res.json();
        setDays(data);
      }
    } catch {
      // Keep current days on error
    } finally {
      setLoading(false);
    }
  };

  const refreshCalendar = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/calendar?propertyId=${selectedPropertyId}`);
      if (res.ok) setDays(await res.json());
    } finally {
      setLoading(false);
    }
  };

  const available = days.filter((d) => d.status === "available").length;
  const booked = days.filter((d) => d.status === "booked").length;
  const blocked = days.filter((d) => d.status === "blocked").length;

  return (
    <div className="space-y-4">
      {/* View Toggle */}
      <div className="flex items-center gap-2">
        <Button
          variant={view === "single" ? "default" : "outline"}
          size="sm"
          onClick={() => setView("single")}
        >
          Single Property
        </Button>
        <Button
          variant={view === "multi" ? "default" : "outline"}
          size="sm"
          onClick={() => setView("multi")}
        >
          Multi-Property
        </Button>
      </div>

      {view === "single" ? (
        <>
          <div className="flex items-center justify-between">
            <Select
              value={selectedPropertyId}
              onValueChange={handlePropertyChange}
            >
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select property" />
              </SelectTrigger>
              <SelectContent>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-sm bg-green-200 dark:bg-green-900" />
                Available ({available})
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-sm bg-red-200 dark:bg-red-900" />
                Booked ({booked})
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-sm bg-primary/20 dark:bg-primary/900" />
                Blocked ({blocked})
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              Loading calendar...
            </div>
          ) : (
            <CalendarGrid days={days} onRefresh={refreshCalendar} />
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-3 text-sm">
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-sm bg-green-200 dark:bg-green-900" />
              Available
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-sm bg-red-300 dark:bg-red-800" />
              Booked
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-sm bg-primary/20 dark:bg-primary/900" />
              Blocked
            </div>
          </div>
          {allCalendars && (
            <MultiPropertyCalendar
              properties={properties}
              calendars={allCalendars}
            />
          )}
        </>
      )}
    </div>
  );
}

"use client";

import * as React from "react";
import { format, addDays, startOfDay } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";

interface DateRangePickerProps {
    className?: string;
    date: DateRange | undefined;
    setDate: (date: DateRange | undefined) => void;
}

export function DateRangePicker({
    className,
    date,
    setDate,
}: DateRangePickerProps) {
    // Today (start of day) is the minimum selectable date.
    // Max selectable date is 1 month (30 days) from today.
    const today = startOfDay(new Date());
    const maxDate = addDays(today, 30);

    return (
        <div className={cn("grid gap-2", className)}>
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        id="date"
                        variant={"outline"}
                        className={cn(
                            "w-[280px] justify-start text-left font-normal border-primary/20 bg-primary/5 hover:bg-primary/10 hover:border-primary/40 transition-all",
                            !date && "text-muted-foreground"
                        )}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                        {date?.from ? (
                            date.to ? (
                                <>
                                    {format(date.from, "LLL dd, y")} -{" "}
                                    {format(date.to, "LLL dd, y")}
                                </>
                            ) : (
                                format(date.from, "LLL dd, y")
                            )
                        ) : (
                            <span>Select date range</span>
                        )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                    <div className="flex flex-col sm:flex-row divide-x divide-border">
                        <Calendar
                            initialFocus
                            mode="range"
                            defaultMonth={today}
                            selected={date}
                            onSelect={setDate}
                            numberOfMonths={2}
                            fromDate={today}
                            toDate={maxDate}
                            disabled={[
                                { before: today },
                                { after: maxDate },
                            ]}
                        />
                    </div>
                    <div className="px-3 pb-3 pt-2 text-center border-t border-border bg-muted/20">
                        <p className="text-[10px] text-muted-foreground font-semibold">
                            Selectable: Today to{" "}
                            <span className="text-primary font-bold">
                                {format(maxDate, "LLL dd, y")}
                            </span>{" "}
                            (Next 1 month only)
                        </p>
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    );
}


import { format, startOfMonth, getDay, endOfMonth, eachMonthOfInterval, isWithinInterval } from "date-fns";

export interface CalendarDayData {
    date: string;
    status: string; // 'available', 'booked', 'reserved', 'blocked'
    price: number;
}

export interface ReservationData {
    title: string;
    startDate: string;
    endDate: string;
    financials: {
        totalPrice?: number;
        reservationStatus?: string;
        channelName?: string;
    };
}

interface CalendarVisualizerProps {
    days: CalendarDayData[];
    reservations?: ReservationData[];
    dateRange: { from: string; to: string };
}

export function CalendarVisualizer({ days, reservations = [], dateRange }: CalendarVisualizerProps) {
    if (!dateRange || !dateRange.from || !dateRange.to) return null;

    const startDate = new Date(dateRange.from);
    const endDate = new Date(dateRange.to);
    const monthsInRange = eachMonthOfInterval({ start: startDate, end: endDate });

    // Helper to find a reservation for a given date
    const getReservationForDate = (dateStr: string) => {
        const targetDate = new Date(dateStr);
        return reservations.find(r => {
            const start = new Date(r.startDate);
            const end = new Date(r.endDate);
            return targetDate >= start && targetDate <= end;
        });
    };

    return (
        <div className="flex flex-col space-y-6">
            <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Booked</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Available</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700"></span> Blocked</span>
            </div>

            {monthsInRange.map((monthDate) => {
                const monthKey = format(monthDate, "yyyy-MM");
                const firstDayDate = startOfMonth(monthDate);
                const startDayOffset = getDay(firstDayDate); // 0 = Sunday, 1 = Monday...
                const blankDays = Array.from({ length: startDayOffset }).map((_, i) => i);

                const monthTitle = format(firstDayDate, "MMMM yyyy");
                const daysInMonth = parseInt(format(endOfMonth(firstDayDate), "d"));

                const gridDays = Array.from({ length: daysInMonth }).map((_, i) => {
                    const dateNumber = i + 1;
                    const fullDateStr = `${monthKey}-${String(dateNumber).padStart(2, '0')}`;
                    const foundDay = days.find(d => d.date === fullDateStr);
                    const res = getReservationForDate(fullDateStr);
                    return {
                        dayNum: dateNumber,
                        fullDateStr,
                        data: foundDay,
                        reservation: res
                    }
                });

                return (
                    <div key={monthKey} className="flex flex-col">
                        <h4 className="font-semibold text-sm mb-3 text-foreground">{monthTitle}</h4>
                        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground mb-2">
                            <div>Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div>
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                            {blankDays.map((b) => (
                                <div key={`blank-${b}`} className="h-10 rounded-md border border-transparent pt-1"></div>
                            ))}
                            {gridDays.map((gridDay) => {
                                let bgClass = "bg-muted/30 text-muted-foreground opacity-50";
                                let tooltip = "Out of range";

                                if (gridDay.data) {
                                    if (gridDay.data.status === 'booked' || gridDay.data.status === 'reserved') {
                                        bgClass = "bg-rose-500 text-white font-bold shadow-sm";
                                    } else if (gridDay.data.status === 'blocked') {
                                        bgClass = "bg-slate-300 dark:bg-slate-700 text-muted-foreground";
                                    } else {
                                        bgClass = "bg-emerald-500 text-white font-bold shadow-sm";
                                    }
                                    tooltip = `${gridDay.data.status.toUpperCase()} \nPrice: ${gridDay.data.price} AED`;
                                }

                                if (gridDay.reservation) {
                                    tooltip += `\nGuest: ${gridDay.reservation.title}`;
                                    if (gridDay.reservation.financials?.totalPrice) {
                                        tooltip += `\nTotal: ${gridDay.reservation.financials.totalPrice} AED`;
                                    }
                                    if (gridDay.reservation.financials?.channelName) {
                                        tooltip += `\nChannel: ${gridDay.reservation.financials.channelName}`;
                                    }
                                }

                                return (
                                    <div
                                        key={gridDay.dayNum}
                                        title={tooltip}
                                        className={`h-10 rounded border border-border/50 flex flex-col items-center justify-center text-xs transition-opacity hover:opacity-80 ${bgClass} ${gridDay.reservation ? 'ring-1 ring-offset-1 ring-primary' : ''}`}
                                    >
                                        <span>{gridDay.dayNum}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

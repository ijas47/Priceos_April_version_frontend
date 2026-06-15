"use client";

import { Building2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PropertyListing } from "@/types";

interface Props {
  property: PropertyListing;
  isActive: boolean;
  onClick: () => void;
  occupancy?: number;
  unreadCount?: number;
}

export function CompactPropertyCard({
  property,
  isActive,
  onClick,
  occupancy = 0,
  unreadCount = 0,
}: Props) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-xl border transition-all duration-300 group relative overflow-hidden",
        isActive
          ? "bg-primary/10 border-primary/40 shadow-[0_0_20px_rgba(var(--primary),0.05)]"
          : "bg-background/40 border-border/50 hover:bg-background/60 hover:border-primary/30"
      )}
    >
      {isActive && (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-blue-500/5 pointer-events-none" />
      )}

      <div className="p-3 relative z-10">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div
              className={cn(
                "rounded-lg p-2 shrink-0 transition-colors",
                isActive ? "bg-primary/20 text-primary" : "bg-muted/50 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
              )}
            >
              <Building2 className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p
                  className={cn(
                    "text-sm font-bold truncate tracking-tight transition-colors flex-1",
                    isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                  )}
                >
                  {property.name}
                </p>
                {unreadCount > 0 && (
                  <span className="shrink-0 inline-flex items-center justify-center h-4 min-w-[1rem] px-1 rounded-full bg-primary text-[9px] font-black text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </div>
              {property.area && (
                <div className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-muted-foreground/60 mt-0.5">
                  <MapPin className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate">{property.area}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-3 mt-1 pt-2 border-t border-border/30">
          <div className="flex flex-col">
            <span className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-[0.1em] mb-0.5">Occupancy</span>
            <div className="flex items-center gap-1.5">
              <div className={cn(
                "h-1.5 w-1.5 rounded-full animate-pulse",
                occupancy >= 70 ? "bg-emerald-500" : occupancy >= 50 ? "bg-primary" : "bg-rose-500"
              )} />
              <span className={cn(
                "text-xs font-black tabular-nums",
                occupancy >= 70 ? "text-emerald-600" : occupancy >= 50 ? "text-primary" : "text-rose-600"
              )}>
                {occupancy}%
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-[0.1em] mb-0.5">Avg Rate</span>
            <span className="text-xs font-black text-foreground tabular-nums tracking-tighter">
              {property.currencyCode}{" "}
              {Number(
                (property as { avgPrice?: number | string }).avgPrice ?? property.price ?? 0
              ).toLocaleString("en-US")}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

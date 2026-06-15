"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: number; label: string };
  gradient?: string;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  gradient = "from-primary to-primary/85"
}: StatCardProps) {
  return (
    <Card className="group relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:scale-[1.02]">
      {/* Gradient overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-sky-50/50 to-blue-50/50 dark:from-primary/10 dark:to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      <CardContent className="relative p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              {title}
            </p>
            <p className="text-3xl font-black tracking-tight bg-gradient-to-br from-primary to-primary/85 dark:from-primary dark:to-sky-400 bg-clip-text text-transparent">
              {value}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground font-medium">{subtitle}</p>
            )}
            {trend && (
              <div className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold",
                trend.value > 0
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                  : trend.value < 0
                  ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                  : "bg-muted text-muted-foreground"
              )}>
                {trend.value > 0 ? "↑" : trend.value < 0 ? "↓" : "→"}
                {Math.abs(trend.value)}% {trend.label}
              </div>
            )}
          </div>

          {/* Gradient icon */}
          <div className={`rounded-xl bg-gradient-to-br ${gradient} p-3 shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300`}>
            <Icon className="h-6 w-6 text-white" />
          </div>
        </div>

        {/* Bottom accent line */}
        <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
      </CardContent>
    </Card>
  );
}

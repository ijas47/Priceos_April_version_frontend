"use client";

import type { PricingData } from "@/types/chat";
import { ConfidenceBar } from "./confidence-bar";
import { RiskBadge } from "./risk-badge";
import { Zap, BarChart3, Info } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface StructuredResponseProps {
  data: PricingData;
}

export function StructuredResponse({ data }: StructuredResponseProps) {
  return (
    <div className="mt-3 space-y-3 rounded-lg border bg-card p-3 text-card-foreground">
      {/* Recommended Price */}
      {data.recommended_price_aed && (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Recommended Price</p>
            <p className="text-xl font-bold">
              {data.recommended_price_aed} <span className="text-sm font-normal">AED/night</span>
            </p>
            {data.price_change_pct !== undefined && (
              <p
                className={
                  data.price_change_pct > 0
                    ? "text-xs text-green-600"
                    : data.price_change_pct < 0
                      ? "text-xs text-red-600"
                      : "text-xs text-muted-foreground"
                }
              >
                {data.price_change_pct > 0 ? "+" : ""}
                {data.price_change_pct}% from current
              </p>
            )}
          </div>
          {data.risk_level && <RiskBadge level={data.risk_level} />}
        </div>
      )}

      {/* Confidence */}
      {data.confidence !== undefined && (
        <ConfidenceBar value={data.confidence} />
      )}

      <Separator />

      {/* Event Context */}
      {data.event_context && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <Zap className="h-3 w-3 text-primary" />
            Event Context
          </div>
          <p className="text-xs text-muted-foreground">{data.event_context}</p>
        </div>
      )}

      {/* Market Signals */}
      {data.market_signals && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <BarChart3 className="h-3 w-3 text-blue-500" />
            Market Signals
          </div>
          <p className="text-xs text-muted-foreground">{data.market_signals}</p>
        </div>
      )}

      {/* Reasoning */}
      {data.reasoning && (
        <div className="space-y-1">
          <p className="text-xs font-medium">Reasoning</p>
          <p className="text-xs text-muted-foreground">{data.reasoning}</p>
        </div>
      )}

      {/* Booking Window Advice */}
      {data.booking_window_advice && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <Info className="h-3 w-3 text-muted-foreground" />
            Booking Window
          </div>
          <p className="text-xs text-muted-foreground">
            {data.booking_window_advice}
          </p>
        </div>
      )}
    </div>
  );
}

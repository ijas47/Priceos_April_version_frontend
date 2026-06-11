"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ComposedChart,
  Area,
} from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Target, Loader2, TrendingDown } from "lucide-react";
import type {
  ElasticityParams,
  CurvePoint,
  OptimalPriceResult,
} from "@/lib/elasticity/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ElasticityCurveCardProps {
  /** Listing ID to fetch elasticity data for. */
  listingId: string;
  /** Current nightly price (shown as a reference line on the chart). */
  currentPrice?: number;
  /** Price floor. */
  floor?: number;
  /** Price ceiling. */
  ceiling?: number;
  /** Currency code for display (default "AED"). */
  currency?: string;
  /** Optional: pre-computed params — skip the /fit API call. */
  preloadedParams?: ElasticityParams;
  /** Optional: pre-computed curve data. */
  preloadedCurve?: CurvePoint[];
  /** Optional: pre-computed optimal price. */
  preloadedOptimal?: OptimalPriceResult;
}

// ---------------------------------------------------------------------------
// Chart config
// ---------------------------------------------------------------------------

const chartConfig = {
  pBook: {
    label: "P(book)",
    color: "hsl(var(--chart-1))",
  },
  expectedRevenue: {
    label: "Expected Revenue",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ElasticityCurveCard({
  listingId,
  currentPrice,
  floor = 100,
  ceiling = 3000,
  currency = "AED",
  preloadedParams,
  preloadedCurve,
  preloadedOptimal,
}: ElasticityCurveCardProps) {
  const [params, setParams] = useState<ElasticityParams | null>(
    preloadedParams ?? null,
  );
  const [curve, setCurve] = useState<CurvePoint[]>(preloadedCurve ?? []);
  const [optimal, setOptimal] = useState<OptimalPriceResult | null>(
    preloadedOptimal ?? null,
  );
  const [loading, setLoading] = useState(!preloadedParams);
  const [error, setError] = useState<string | null>(null);

  const fetchModel = useCallback(async () => {
    if (preloadedParams) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        listingId,
        floor: String(floor),
        ceiling: String(ceiling),
      });
      const res = await fetch(`/api/elasticity/fit?${qs}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setParams(data.params);
      setCurve(data.curve);
      setOptimal(data.optimal);
    } catch (err) {
      console.error("[ElasticityCurveCard]", err);
      setError(err instanceof Error ? err.message : "Failed to load model");
    } finally {
      setLoading(false);
    }
  }, [listingId, floor, ceiling, preloadedParams]);

  useEffect(() => {
    fetchModel();
  }, [fetchModel]);

  // -------------------------------------------------------------------------
  // Confidence label
  // -------------------------------------------------------------------------
  const confidenceLabel = getConfidenceLabel(params?.sampleSize ?? 0);

  // -------------------------------------------------------------------------
  // Max expected revenue for Y-axis scaling
  // -------------------------------------------------------------------------
  const maxExpRev =
    curve.length > 0
      ? Math.max(...curve.map((p) => p.expectedRevenue))
      : 1;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <Card className="relative overflow-hidden group">
      {/* Decorative gradient */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-violet-100/20 to-blue-100/20 dark:from-violet-900/10 dark:to-blue-900/10 rounded-full blur-3xl" />

      <CardHeader className="relative">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <div className="rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 p-2 shadow-md">
                <Activity className="h-4 w-4 text-white" />
              </div>
              Demand Elasticity
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Booking probability vs. nightly price
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            {params && (
              <Badge variant={confidenceLabel.variant} className="text-[10px]">
                {confidenceLabel.text}
              </Badge>
            )}
            {params && (
              <span className="text-[10px] text-muted-foreground">
                n={params.sampleSize.toLocaleString("en-US")}
              </span>
            )}
          </div>
        </div>

        {/* Optimal price callout */}
        {optimal && !loading && (
          <div className="mt-3 flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs text-muted-foreground">Optimal:</span>
              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                {currency}{" "}
                {optimal.price.toLocaleString("en-US")}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-xs text-muted-foreground">P(book):</span>
              <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                {(optimal.pBook * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">E[Rev]:</span>
              <span className="text-sm font-bold">
                {currency}{" "}
                {optimal.expectedRevenue.toLocaleString("en-US")}
              </span>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="relative">
        {loading && (
          <div className="flex items-center justify-center h-[300px]">
            <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-[300px] text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && curve.length > 0 && (
          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <ComposedChart data={curve} accessibilityLayer>
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                opacity={0.3}
              />

              <XAxis
                dataKey="price"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                className="text-xs font-medium"
                tickFormatter={(v) =>
                  `${(v / 1000).toFixed(v >= 1000 ? 1 : 0)}${v >= 1000 ? "k" : ""}`
                }
                label={{
                  value: `Price (${currency})`,
                  position: "insideBottom",
                  offset: -5,
                  className: "text-[10px] fill-muted-foreground",
                }}
              />

              {/* Left Y axis: P(book) 0-100% */}
              <YAxis
                yAxisId="left"
                tickLine={false}
                axisLine={false}
                className="text-xs font-medium"
                tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                domain={[0, 1]}
              />

              {/* Right Y axis: Expected Revenue */}
              <YAxis
                yAxisId="right"
                orientation="right"
                tickLine={false}
                axisLine={false}
                className="text-xs font-medium"
                tickFormatter={(v) =>
                  `${(v / 1000).toFixed(v >= 1000 ? 1 : 0)}${v >= 1000 ? "k" : ""}`
                }
                domain={[0, Math.ceil(maxExpRev / 100) * 100]}
              />

              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => {
                      if (name === "pBook") {
                        return `${((value as number) * 100).toFixed(1)}%`;
                      }
                      return `${currency} ${(value as number).toLocaleString("en-US")}`;
                    }}
                  />
                }
              />

              {/* Expected revenue area (behind the line) */}
              <defs>
                <linearGradient
                  id="expRevGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor="hsl(var(--chart-2))"
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="100%"
                    stopColor="hsl(var(--chart-2))"
                    stopOpacity={0.05}
                  />
                </linearGradient>
              </defs>
              <Area
                yAxisId="right"
                dataKey="expectedRevenue"
                type="monotone"
                fill="url(#expRevGradient)"
                stroke="hsl(var(--chart-2))"
                strokeWidth={2}
                strokeDasharray="4 2"
                dot={false}
              />

              {/* P(book) line */}
              <Line
                yAxisId="left"
                dataKey="pBook"
                type="monotone"
                stroke="hsl(var(--chart-1))"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2 }}
              />

              {/* Current price reference line */}
              {currentPrice != null && (
                <ReferenceLine
                  yAxisId="left"
                  x={findClosestPrice(curve, currentPrice)}
                  stroke="hsl(var(--destructive))"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  label={{
                    value: "Current",
                    position: "top",
                    className:
                      "text-[10px] font-bold fill-destructive",
                  }}
                />
              )}

              {/* Optimal price reference line */}
              {optimal && (
                <ReferenceLine
                  yAxisId="left"
                  x={findClosestPrice(curve, optimal.price)}
                  stroke="#10b981"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  label={{
                    value: "Optimal",
                    position: "top",
                    className:
                      "text-[10px] font-bold fill-emerald-500",
                  }}
                />
              )}
            </ComposedChart>
          </ChartContainer>
        )}

        {/* Model details footer */}
        {params && !loading && (
          <div className="mt-4 flex items-center gap-4 text-[10px] text-muted-foreground border-t pt-3">
            <span>
              ADR: {currency}{" "}
              {params.adr.toLocaleString("en-US")}
            </span>
            <span className="text-border">|</span>
            <span>
              beta0={params.beta0.toFixed(2)}, beta1={params.beta1.toFixed(2)}
            </span>
            <span className="text-border">|</span>
            <span>
              Fitted:{" "}
              {new Date(params.fittedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Find the closest price in the curve data to use for ReferenceLine x value. */
function findClosestPrice(curve: CurvePoint[], target: number): number {
  if (curve.length === 0) return target;
  let closest = curve[0].price;
  let minDiff = Math.abs(curve[0].price - target);
  for (const pt of curve) {
    const diff = Math.abs(pt.price - target);
    if (diff < minDiff) {
      minDiff = diff;
      closest = pt.price;
    }
  }
  return closest;
}

/** Map sample size to a human-readable confidence badge. */
function getConfidenceLabel(sampleSize: number): {
  text: string;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  if (sampleSize >= 90) {
    return { text: "High confidence", variant: "default" };
  }
  if (sampleSize >= 30) {
    return { text: "Moderate confidence", variant: "secondary" };
  }
  if (sampleSize >= 10) {
    return { text: "Low confidence", variant: "outline" };
  }
  return { text: "Cold start", variant: "destructive" };
}

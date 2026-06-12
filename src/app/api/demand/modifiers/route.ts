/**
 * GET /api/demand/modifiers
 *
 * Computes source-market demand modifiers for a destination market and time period.
 *
 * Query params:
 *   - marketTemplate (string, required): destination key e.g. "dubai", "london"
 *   - month (number, optional): calendar month 1-12. Defaults to current month.
 *   - dateFrom (string, optional): ISO date — month is derived if provided.
 *   - dateTo (string, optional): ISO date — for display context only.
 *
 * The route first tries to fetch live signals from the backend
 * `/demand/source-market-signals` endpoint. If unavailable, it falls back
 * to the seasonal baseline computed from source market definitions.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  computeDemandModifier,
  getDefaultSignals,
  type DemandSignal,
} from "@/lib/demand/modifiers";

const RAW_BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

/** Resolve the backend base to an absolute URL (handles NEXT_PUBLIC_API_URL=/api). */
function backendBase(req: NextRequest): string {
  if (RAW_BACKEND.startsWith("http")) return RAW_BACKEND;
  return `${req.nextUrl.origin}${RAW_BACKEND}`.replace(/\/$/, "");
}

const querySchema = z.object({
  marketTemplate: z.string().min(1),
  month: z.coerce.number().int().min(1).max(12).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const params = Object.fromEntries(req.nextUrl.searchParams.entries());
    const parsed = querySchema.safeParse(params);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid parameters", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const { marketTemplate, dateFrom, dateTo } = parsed.data;

    // Derive the target month
    let month = parsed.data.month;
    if (!month && dateFrom) {
      month = new Date(dateFrom).getMonth() + 1; // getMonth is 0-indexed
    }
    if (!month) {
      month = new Date().getMonth() + 1;
    }

    // Try to fetch live signals from the backend
    let signals: DemandSignal[] | null = null;

    try {
      const q = new URLSearchParams({
        marketTemplate,
        month: String(month),
      });
      if (dateFrom) q.set("dateFrom", dateFrom);
      if (dateTo) q.set("dateTo", dateTo);

      const backendRes = await fetch(
        `${backendBase(req)}/demand/source-market-signals?${q}`,
        { signal: AbortSignal.timeout(5000) },
      );

      if (backendRes.ok) {
        const data = await backendRes.json();
        if (Array.isArray(data.signals) && data.signals.length > 0) {
          signals = data.signals as DemandSignal[];
        }
      }
    } catch {
      // Backend unavailable — fall back to seasonal baseline
    }

    // Use seasonal defaults if no live signals
    let source: "live" | "seasonal_baseline" = "live";
    if (!signals) {
      signals = getDefaultSignals(marketTemplate, month);
      source = "seasonal_baseline";
    }

    const result = computeDemandModifier(marketTemplate, month, signals);

    return NextResponse.json({
      ...result,
      marketTemplate,
      month,
      source,
    });
  } catch (err) {
    console.error("[demand/modifiers GET]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

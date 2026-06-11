import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAccessToken } from "@/lib/auth/jwt";
import type { BacktestResult, BacktestDecision } from "@/lib/backtest/types";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

const replaySchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  listingId: z.string().optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "dateFrom must be YYYY-MM-DD"),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "dateTo must be YYYY-MM-DD"),
});

// ---------------------------------------------------------------------------
// Mock data generator -- used when the backend endpoint is not available
// ---------------------------------------------------------------------------

const MOCK_LISTINGS = [
  { id: "1001", name: "Marina Heights 1BR" },
  { id: "1002", name: "Downtown Residences 2BR" },
  { id: "1003", name: "JBR Beach Studio" },
  { id: "1004", name: "Palm Villa 3BR" },
  { id: "1005", name: "Bay View 1BR" },
];

function generateMockBacktest(
  dateFrom: string,
  dateTo: string,
  listingId?: string
): BacktestResult {
  const start = new Date(`${dateFrom}T00:00:00`);
  const end = new Date(`${dateTo}T00:00:00`);
  const dayMs = 86_400_000;
  const dayCount = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / dayMs) + 1
  );

  const listings = listingId
    ? MOCK_LISTINGS.filter((l) => l.id === listingId)
    : MOCK_LISTINGS;

  // Seeded-ish deterministic random based on dateFrom
  let seed = dateFrom.split("-").reduce((a, b) => a + Number(b), 0);
  const rand = () => {
    seed = (seed * 16807 + 7) % 2147483647;
    return (seed & 0x7fffffff) / 0x7fffffff;
  };

  const decisions: BacktestDecision[] = [];

  for (let d = 0; d < dayCount; d++) {
    const date = new Date(start.getTime() + d * dayMs);
    const dateStr = date.toISOString().slice(0, 10);

    for (const listing of listings) {
      const basePrice = 400 + Number(listing.id.slice(-2)) * 80;
      const proposedPrice = Math.round(basePrice * (0.85 + rand() * 0.35));
      const actualPrice = Math.round(basePrice * (0.85 + rand() * 0.35));
      const wasBooked = rand() > 0.3;
      const riskLevels: Array<"low" | "medium" | "high"> = [
        "low",
        "low",
        "low",
        "medium",
        "medium",
        "high",
      ];
      const riskLevel = riskLevels[Math.floor(rand() * riskLevels.length)];
      const proposalAccepted = rand() > 0.15;
      const errorPct =
        actualPrice > 0
          ? Math.round(
              (Math.abs(proposedPrice - actualPrice) / actualPrice) * 10000
            ) / 100
          : 0;
      const revenueImpact = wasBooked ? proposedPrice - actualPrice : 0;

      decisions.push({
        date: dateStr,
        listingId: listing.id,
        listingName: listing.name,
        proposedPrice,
        actualPrice,
        wasBooked,
        revenueImpact,
        riskLevel,
        proposalAccepted,
        errorPct,
      });
    }
  }

  // Aggregate daily accuracy (within 10% considered accurate)
  const byDate = new Map<string, { correct: number; total: number }>();
  for (const d of decisions) {
    const entry = byDate.get(d.date) ?? { correct: 0, total: 0 };
    entry.total++;
    if (d.errorPct <= 10) entry.correct++;
    byDate.set(d.date, entry);
  }
  const dailyAccuracy = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      accuracy: Math.round((v.correct / v.total) * 10000) / 100,
      count: v.total,
    }));

  // Risk breakdown
  const riskBuckets: Record<
    "low" | "medium" | "high",
    { total: number; correct: number }
  > = {
    low: { total: 0, correct: 0 },
    medium: { total: 0, correct: 0 },
    high: { total: 0, correct: 0 },
  };
  for (const d of decisions) {
    riskBuckets[d.riskLevel].total++;
    if (d.errorPct <= 10) riskBuckets[d.riskLevel].correct++;
  }

  const pct = (c: number, t: number) =>
    t > 0 ? Math.round((c / t) * 10000) / 100 : 0;

  const totalCorrect = decisions.filter((d) => d.errorPct <= 10).length;
  const mae =
    decisions.length > 0
      ? Math.round(
          (decisions.reduce((s, d) => s + d.errorPct, 0) / decisions.length) *
            100
        ) / 100
      : 0;
  const totalRevenue = decisions.reduce((s, d) => s + d.actualPrice, 0);
  const revenueImpactTotal = decisions.reduce(
    (s, d) => s + d.revenueImpact,
    0
  );

  return {
    totalDecisions: decisions.length,
    accuracyPct: pct(totalCorrect, decisions.length),
    meanAbsoluteError: mae,
    revenueImpactTotal,
    revenueImpactPct:
      totalRevenue > 0
        ? Math.round((revenueImpactTotal / totalRevenue) * 10000) / 100
        : 0,
    decisions,
    dailyAccuracy,
    riskBreakdown: {
      low: { ...riskBuckets.low, pct: pct(riskBuckets.low.correct, riskBuckets.low.total) },
      medium: { ...riskBuckets.medium, pct: pct(riskBuckets.medium.correct, riskBuckets.medium.total) },
      high: { ...riskBuckets.high, pct: pct(riskBuckets.high.correct, riskBuckets.high.total) },
    },
    metadata: {
      dateFrom,
      dateTo,
      listingId,
      runAt: new Date().toISOString(),
      source: "mock",
    },
  };
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    // Authenticate
    const token = req.cookies.get("priceos-session")?.value;
    if (!token) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }
    const payload = verifyAccessToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Validate body
    const body = await req.json();
    const parsed = replaySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 }
      );
    }

    const { orgId, listingId, dateFrom, dateTo } = parsed.data;

    // Try proxying to backend first
    try {
      const backendRes = await fetch(`${BACKEND}/audit/replay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orgId, listingId, dateFrom, dateTo }),
        signal: AbortSignal.timeout(15_000),
      });

      if (backendRes.ok) {
        const data = await backendRes.json();
        return NextResponse.json(data, { status: 200 });
      }

      // If backend returns 404 or 501, fall through to mock
      if (backendRes.status !== 404 && backendRes.status !== 501) {
        const errData = await backendRes.json().catch(() => ({}));
        return NextResponse.json(errData, { status: backendRes.status });
      }
    } catch {
      // Backend unreachable -- fall through to mock generation
    }

    // Generate mock data for demo
    const result = generateMockBacktest(dateFrom, dateTo, listingId);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error("[backtest/replay POST]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export interface BacktestRequest {
  orgId: string;
  listingId?: string;
  dateFrom: string;
  dateTo: string;
}

export interface BacktestDecision {
  date: string;
  listingId: string;
  listingName: string;
  proposedPrice: number;
  actualPrice: number;
  wasBooked: boolean;
  revenueImpact: number;
  riskLevel: "low" | "medium" | "high";
  proposalAccepted: boolean;
  errorPct: number;
}

export interface BacktestResult {
  totalDecisions: number;
  accuracyPct: number;
  meanAbsoluteError: number;
  revenueImpactTotal: number;
  revenueImpactPct: number;
  decisions: BacktestDecision[];
  dailyAccuracy: Array<{ date: string; accuracy: number; count: number }>;
  riskBreakdown: {
    low: { total: number; correct: number; pct: number };
    medium: { total: number; correct: number; pct: number };
    high: { total: number; correct: number; pct: number };
  };
  metadata: {
    dateFrom: string;
    dateTo: string;
    listingId?: string;
    runAt: string;
    source: "backend" | "mock";
  };
}

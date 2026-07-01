import { describe, expect, it } from "vitest";
import { buildMarketIntelPayload } from "./market-intel-payload";

describe("buildMarketIntelPayload", () => {
  it("splits news, daily events, holidays, and major events", () => {
    const payload = buildMarketIntelPayload([
      {
        name: "UAE tourism up 12%",
        startDate: "2026-07-01",
        endDate: "2026-07-07",
        source: "newsapi",
        upliftPct: 5,
        description: "demand-positive signal",
      },
      {
        name: "Jazz Night",
        startDate: "2026-07-10",
        endDate: "2026-07-10",
        source: "ticketmaster",
        impactLevel: "medium",
        upliftPct: 12,
        description: "8000 attendees expected",
      },
      {
        name: "Eid Al Adha",
        startDate: "2026-07-05",
        endDate: "2026-07-08",
        source: "market_template",
        impactLevel: "high",
        upliftPct: 25,
      },
      {
        name: "GITEX",
        startDate: "2026-07-12",
        endDate: "2026-07-16",
        source: "dtcm",
        impactLevel: "high",
        upliftPct: 30,
      },
    ]);

    expect(payload.news).toHaveLength(1);
    expect(payload.daily_events[0]?.title).toBe("Jazz Night");
    expect(payload.holidays[0]?.title).toBe("Eid Al Adha");
    expect(payload.market_events[0]?.title).toBe("GITEX");
    expect(payload.demand_outlook.net_news_factor_pct).toBe(5);
  });
});
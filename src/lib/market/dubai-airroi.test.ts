import { describe, expect, it } from "vitest";
import {
  isDubaiMarket,
  resolveDubaiAreaKeys,
  mergeMarketSignals,
  hasAirbticsPacingData,
} from "./dubai-airroi";
import type { MarketSignal } from "@/lib/engine/waterfall";

describe("isDubaiMarket", () => {
  it("matches Dubai AE", () => {
    expect(isDubaiMarket("Dubai", "AE")).toBe(true);
  });

  it("rejects non-Dubai cities", () => {
    expect(isDubaiMarket("London", "GB")).toBe(false);
  });
});

describe("resolveDubaiAreaKeys", () => {
  it("resolves marina alias", () => {
    const keys = resolveDubaiAreaKeys("Dubai Marina", "Dubai");
    expect(keys[0]).toBe("dubai marina");
    expect(keys).toContain("dubai_city");
  });

  it("falls back to city-wide key", () => {
    const keys = resolveDubaiAreaKeys("Dubai", "Dubai");
    expect(keys).toEqual(["dubai_city"]);
  });
});

describe("hasAirbticsPacingData", () => {
  it("detects forward pacing in map", () => {
    const map = new Map<string, MarketSignal>([
      ["2026-06-01", { pacingAdr: 210 }],
    ]);
    expect(hasAirbticsPacingData(map)).toBe(true);
  });
});

describe("mergeMarketSignals", () => {
  it("prefers Dubai comp-set and month anchor over Airbtics", () => {
    const dubai = new Map<string, MarketSignal>([
      [
        "2026-06-01",
        {
          compSetP50: 520,
          monthAnchorAdr: 510,
          compSetSource: "dubai_airroi_monthly",
          pacingAdr: 500,
          forwardOccupancy: 0.55,
        },
      ],
    ]);
    const airbtics = new Map<string, MarketSignal>([
      [
        "2026-06-01",
        {
          compSetP50: 700,
          monthAnchorAdr: 680,
          compSetSource: "airbtics_monthly",
          forwardOccupancy: 0.16,
          pacingAdr: 185,
        },
      ],
    ]);

    const merged = mergeMarketSignals(dubai, airbtics, { airbticsLive: true });
    const signal = merged.get("2026-06-01");
    expect(signal?.compSetP50).toBe(520);
    expect(signal?.monthAnchorAdr).toBe(510);
    expect(signal?.compSetSource).toBe("dubai_airroi_monthly");
    expect(signal?.forwardOccupancy).toBe(0.16);
    expect(signal?.pacingAdr).toBe(185);
  });

  it("uses Dubai pacing fallback when Airbtics is not live", () => {
    const dubai = new Map<string, MarketSignal>([
      ["2026-06-01", { pacingAdr: 500, forwardOccupancy: 0.55 }],
    ]);
    const airbtics = new Map<string, MarketSignal>([
      ["2026-06-01", { pacingAdr: 185, forwardOccupancy: 0.16 }],
    ]);

    const merged = mergeMarketSignals(dubai, airbtics, { airbticsLive: false });
    const signal = merged.get("2026-06-01");
    expect(signal?.pacingAdr).toBe(500);
    expect(signal?.forwardOccupancy).toBe(0.55);
  });
});
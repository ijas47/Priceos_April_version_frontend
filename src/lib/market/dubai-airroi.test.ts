import { describe, expect, it } from "vitest";
import {
  isDubaiMarket,
  resolveDubaiAreaKeys,
  mergeMarketSignals,
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

describe("mergeMarketSignals", () => {
  it("prefers Dubai comp-set over Airbtics", () => {
    const dubai = new Map<string, MarketSignal>([
      ["2026-06-01", { compSetP50: 520, compSetSource: "dubai_airroi_comps", pacingAdr: 500 }],
    ]);
    const airbtics = new Map<string, MarketSignal>([
      ["2026-06-01", { compSetP50: 700, compSetSource: "airbtics_comps", forwardOccupancy: 0.8 }],
    ]);

    const merged = mergeMarketSignals(dubai, airbtics);
    const signal = merged.get("2026-06-01");
    expect(signal?.compSetP50).toBe(520);
    expect(signal?.compSetSource).toBe("dubai_airroi_comps");
    expect(signal?.forwardOccupancy).toBe(0.8);
  });
});
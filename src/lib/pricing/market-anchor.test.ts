import { describe, expect, it } from "vitest";
import {
  compSetPercentilesFromAirbtics,
  resolveMarketAnchorBase,
  percentilesFromRates,
} from "./market-anchor";
import type { MarketSignal } from "@/lib/engine/waterfall";

describe("resolveMarketAnchorBase", () => {
  it("de-anchors from flat listed price when comp-set p50 is available", () => {
    const signal: MarketSignal = {
      compSetP50: 520,
      pacingAdr: 500,
      monthAnchorAdr: 510,
      annualAnchorAdr: 480,
    };
    const { price, usedMarketAnchor } = resolveMarketAnchorBase(165, signal);
    expect(usedMarketAnchor).toBe(true);
    expect(price).toBeGreaterThan(400);
    expect(price).not.toBe(165);
  });

  it("falls back to listed reference when no market fields", () => {
    const { price, usedMarketAnchor } = resolveMarketAnchorBase(165, {});
    expect(price).toBe(165);
    expect(usedMarketAnchor).toBe(false);
  });

  it("returns listed price when signal is undefined", () => {
    const { price, usedMarketAnchor } = resolveMarketAnchorBase(165, undefined);
    expect(price).toBe(165);
    expect(usedMarketAnchor).toBe(false);
  });
});

describe("compSetPercentilesFromAirbtics", () => {
  it("computes p50 from ltm_adr", () => {
    const result = compSetPercentilesFromAirbtics([
      { ltm_adr: 400 },
      { ltm_adr: 500 },
      { ltm_adr: 600 },
    ]);
    expect(result.p50).toBe(500);
    expect(result.count).toBe(3);
  });
});

describe("percentilesFromRates", () => {
  it("returns null p50 for empty input", () => {
    expect(percentilesFromRates([]).p50).toBeNull();
  });
});
import { describe, expect, it } from "vitest";
import {
  assessBenchmarkSanity,
  deriveRatesFromAnchor,
  p50CeilingForBedrooms,
} from "./benchmark-sanity";
import { resolveBedroomsNumber } from "./bedrooms";

describe("resolveBedroomsNumber", () => {
  it("preserves studio as 0", () => {
    expect(resolveBedroomsNumber(0)).toBe(0);
  });

  it("falls back only for null/undefined", () => {
    expect(resolveBedroomsNumber(null)).toBe(1);
    expect(resolveBedroomsNumber(undefined, 2)).toBe(2);
  });
});

describe("assessBenchmarkSanity", () => {
  it("rejects 1BR benchmark for studio listed at 170 AED", () => {
    const result = assessBenchmarkSanity({
      p25: 8500,
      p50: 10500,
      p75: 12000,
      currentPrice: 170,
      bedrooms: 0,
    });
    expect(result.rejected).toBe(true);
    expect(result.trusted).toBe(false);
    expect(result.p50).toBe(170);
    expect(result.flags).toContain("p50_exceeds_listed_3x");
    expect(result.flags).toContain("benchmark_replaced");
  });

  it("accepts aligned studio benchmark", () => {
    const result = assessBenchmarkSanity({
      p25: 380,
      p50: 450,
      p75: 520,
      currentPrice: 420,
      bedrooms: 0,
    });
    expect(result.trusted).toBe(true);
    expect(result.rejected).toBe(false);
    expect(result.p50).toBe(450);
  });

  it("prefers achieved ADR when benchmark rejected", () => {
    const result = assessBenchmarkSanity({
      p25: 900,
      p50: 1100,
      p75: 1300,
      currentPrice: 100,
      bedrooms: 0,
      achievedAdr: 410,
    });
    expect(result.rejected).toBe(true);
    expect(result.source).toBe("history");
    expect(result.p50).toBe(410);
  });

  it("enforces bedroom p50 ceiling", () => {
    expect(p50CeilingForBedrooms(0)).toBe(1500);
    expect(p50CeilingForBedrooms(2)).toBe(3000);
    const result = assessBenchmarkSanity({
      p25: 1400,
      p50: 2200,
      p75: 2800,
      currentPrice: 800,
      bedrooms: 1,
    });
    expect(result.rejected).toBe(true);
    expect(result.flags).toContain("p50_exceeds_bedroom_ceiling");
  });
});

describe("deriveRatesFromAnchor", () => {
  it("builds percentile band from anchor", () => {
    const band = deriveRatesFromAnchor(400);
    expect(band.p50).toBe(400);
    expect(band.p25).toBe(340);
    expect(band.p75).toBe(460);
  });
});
import { describe, it, expect } from "vitest";
import { pBook } from "./model";
import type { ElasticityParams } from "./types";

const base: ElasticityParams = {
  beta0: 2.5,
  beta1: -3.8,
  adr: 500,
  sampleSize: 0,
  fittedAt: new Date().toISOString(),
};

describe("pBook", () => {
  it("returns a probability in (0,1)", () => {
    const p = pBook(500, base);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
  });

  it("is monotonically decreasing in price (negative beta1)", () => {
    expect(pBook(400, base)).toBeGreaterThan(pBook(800, base));
  });

  it("does not produce NaN/Infinity when adr is 0", () => {
    const p = pBook(500, { ...base, adr: 0 });
    expect(Number.isFinite(p)).toBe(true);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });
});

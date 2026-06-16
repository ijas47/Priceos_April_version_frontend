import { describe, expect, it } from "vitest";
import {
  resolveBlendedOccupancyPct,
  occupancyToPct,
} from "./occupancy-blend";

describe("resolveBlendedOccupancyPct", () => {
  it("weights market occupancy when listing history is thin", () => {
    const blended = resolveBlendedOccupancyPct({
      listingOccPct: 20,
      marketOccPct: 70,
      listingHistoryDays: 5,
    });
    expect(blended).toBeGreaterThan(20);
    expect(blended).toBeLessThan(70);
  });

  it("trusts listing occ with enough history", () => {
    const blended = resolveBlendedOccupancyPct({
      listingOccPct: 30,
      marketOccPct: 70,
      listingHistoryDays: 30,
    });
    expect(blended).toBeGreaterThan(40);
    expect(blended).toBeLessThan(60);
  });
});

describe("occupancyToPct", () => {
  it("converts 0-1 fraction to percent", () => {
    expect(occupancyToPct(0.65)).toBe(65);
  });
});
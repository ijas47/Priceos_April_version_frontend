import { describe, expect, it } from "vitest";
import { inferMarketFromListings } from "./infer-market";

describe("inferMarketFromListings", () => {
  it("detects Barcelona from majority city", () => {
    const listings = Array.from({ length: 6 }, (_, i) => ({
      city: "Barcelona",
      countryCode: "ES",
    }));
    listings.push({ city: "Barcelona", countryCode: "ES" });

    const result = inferMarketFromListings(listings);
    expect(result.marketCode).toBe("ESP_BCN");
    expect(result.confidence).toBe("high");
    expect(result.primaryShare).toBeGreaterThanOrEqual(0.8);
  });

  it("detects Rome for Italian portfolio", () => {
    const result = inferMarketFromListings(
      Array.from({ length: 5 }, () => ({ city: "Rome", countryCode: "IT" }))
    );
    expect(result.marketCode).toBe("ITA_ROM");
    expect(result.confidence).toBe("high");
  });

  it("keeps Dubai demo listings on UAE_DXB", () => {
    const result = inferMarketFromListings(
      [{ city: "Dubai", countryCode: "AE" }, { city: "Dubai Marina", countryCode: "AE" }]
    );
    expect(result.marketCode).toBe("UAE_DXB");
  });

  it("picks majority city when multi-city (informational only)", () => {
    const result = inferMarketFromListings([
      { city: "Madrid", countryCode: "ES" },
      { city: "Madrid", countryCode: "ES" },
      { city: "Madrid", countryCode: "ES" },
      { city: "Barcelona", countryCode: "ES" },
    ]);
    expect(result.marketCode).toBe("ESP_MAD");
    expect(result.multiCityDetected).toBe(true);
  });

  it("falls back when no city data", () => {
    const result = inferMarketFromListings([{ city: "", countryCode: "" }], "GBR_LON");
    expect(result.marketCode).toBe("GBR_LON");
    expect(result.confidence).toBe("low");
  });
});
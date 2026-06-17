import { describe, expect, it } from "vitest";
import { resolveEventDisplayArea } from "./event-area";

describe("resolveEventDisplayArea", () => {
  it("labels news as city overall", () => {
    expect(
      resolveEventDisplayArea({
        title: "Dubai tourism slump as conflict hits hotels",
        description: "[news] demand-negative signal",
        source: "newsapi",
        city: "Dubai",
        listingArea: "Arabian Ranches",
        storedArea: "Arabian Ranches",
      })
    ).toBe("Dubai (overall)");
  });

  it("keeps area when event text mentions the neighborhood", () => {
    expect(
      resolveEventDisplayArea({
        title: "JBR Beach Festival 2026",
        description: "Venue: JBR Walk",
        source: "ticketmaster",
        city: "Dubai",
        listingArea: "JBR",
      })
    ).toBe("JBR");
  });

  it("does not inherit listing area for generic SERP events", () => {
    expect(
      resolveEventDisplayArea({
        title: "Dubai Turns to New Visitors and Events",
        source: "serpapi_google_events",
        city: "Dubai",
        listingArea: "Arabian Ranches",
        storedArea: "Arabian Ranches",
      })
    ).toBe("Dubai (overall)");
  });
});
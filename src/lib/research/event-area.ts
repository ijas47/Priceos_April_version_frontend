/**
 * Honest area labels for market events - only show a neighborhood when the
 * signal actually references it; otherwise city-wide (e.g. Dubai (overall)).
 */

export interface EventAreaInput {
  title: string;
  description?: string;
  venue?: string;
  eventType?: "event" | "news";
  source?: string;
  city?: string;
  /** Listing neighborhood - used only when title/venue mentions it */
  listingArea?: string;
  /** Stored area from DB (may be wrong legacy data) */
  storedArea?: string;
}

const CITY_WIDE_SOURCES = new Set([
  "newsapi",
  "serpapi_google_news",
  "serpapi",
  "serpapi_google_events",
  "market_template",
]);

function normalizeCity(city?: string): string {
  const c = (city || "Dubai").trim();
  return c || "Dubai";
}

function cityOverallLabel(city: string): string {
  return `${city} (overall)`;
}

function textMentionsArea(haystack: string, area: string): boolean {
  const h = haystack.toLowerCase();
  const a = area.toLowerCase().trim();
  if (!a || a.length < 3) return false;
  return h.includes(a);
}

function extractVenue(description?: string): string | undefined {
  if (!description) return undefined;
  const match = description.match(/Venue:\s*([^.]+)/i);
  return match?.[1]?.trim();
}

/**
 * Resolve the area chip shown in Event Calendar / market tables.
 */
export function resolveEventDisplayArea(input: EventAreaInput): string {
  const city = normalizeCity(input.city);
  const title = input.title || "";
  const description = input.description || "";
  const venue = input.venue || extractVenue(description) || "";
  const haystack = `${title} ${description} ${venue}`;
  const source = (input.source || "").toLowerCase();
  const isNews =
    input.eventType === "news" ||
    source === "newsapi" ||
    description.includes("[news]") ||
    description.includes("demand-negative") ||
    description.includes("demand-positive");

  if (isNews) {
    return cityOverallLabel(city);
  }

  if (CITY_WIDE_SOURCES.has(source)) {
    const listingArea = input.listingArea?.trim();
    if (listingArea && listingArea !== city && textMentionsArea(haystack, listingArea)) {
      return listingArea;
    }
    return cityOverallLabel(city);
  }

  // Ticketed / gov feeds - area only when venue or title names it
  const listingArea = input.listingArea?.trim();
  if (listingArea && listingArea !== city && textMentionsArea(haystack, listingArea)) {
    return listingArea;
  }

  // Venue-specific without neighborhood match → city overall (not random listing area)
  if (venue && venue.length > 2 && !textMentionsArea(haystack, city)) {
    // Named venue but not a known neighborhood - still city-level unless we matched listing area
    return cityOverallLabel(city);
  }

  // Legacy stored area that equals a listing neighborhood but event text doesn't support it
  const stored = input.storedArea?.trim();
  if (stored && stored !== city && textMentionsArea(haystack, stored)) {
    return stored;
  }

  return cityOverallLabel(city);
}
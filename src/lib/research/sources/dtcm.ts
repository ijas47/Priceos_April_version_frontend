/**
 * DTCM / Dubai Calendar (DET) events feed.
 *
 * Live API when DTCM_API_KEY is set; curated official calendar as fallback
 * for eligible Dubai orgs (see dtcm-eligibility.ts).
 *
 * Env:
 *   DTCM_API_KEY or DTCM_SUBSCRIPTION_KEY — Dubai Gov API subscription key
 *   DTCM_API_BASE_URL — default Dubai Calendar API base
 *   DTCM_EVENTS_PATH — default /events
 */

import type { SourceEvent, SourceError } from "../sources";
// Note: sources.ts must NOT re-export this module (avoids circular import).
import { getDtcmCuratedEvents } from "../dtcm-curated-calendar";

function getDtcmKey(): string | undefined {
  return (
    process.env.DTCM_API_KEY?.trim() ||
    process.env.DTCM_SUBSCRIPTION_KEY?.trim() ||
    undefined
  );
}

async function fetchJson(url: string, headers: Record<string, string>, timeoutMs = 15000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function parseApiEvents(data: unknown, city: string, dateFrom: string, dateTo: string): SourceEvent[] {
  const raw =
    (data as { events?: unknown[] })?.events ??
    (data as { data?: unknown[] })?.data ??
    (data as { result?: unknown[] })?.result ??
    (Array.isArray(data) ? data : []);

  if (!Array.isArray(raw)) return [];

  const events: SourceEvent[] = [];

  for (const item of raw) {
    const row = item as Record<string, unknown>;
    const title =
      String(row.eventName || row.name || row.title || row.eventTitle || "").trim();
    if (!title) continue;

    const startRaw =
      row.startDate || row.start_date || row.eventStartDate || row.fromDate || row.start;
    const endRaw =
      row.endDate || row.end_date || row.eventEndDate || row.toDate || row.end || startRaw;

    const start = String(startRaw || "").slice(0, 10);
    const end = String(endRaw || start).slice(0, 10);
    if (!start || start.length < 10) continue;
    if (end < dateFrom || start > dateTo) continue;

    events.push({
      title,
      dateStart: start,
      dateEnd: end.length >= 10 ? end : start,
      venue: String(row.venue || row.venueName || row.location || "") || undefined,
      city,
      url: String(row.url || row.eventUrl || row.website || "") || undefined,
      source: "dtcm",
      raw: item,
    });
  }

  return events;
}

/** Live DTCM / Dubai Calendar API (Dubai Government Open Data). */
async function fetchDtcmLiveApi(
  city: string,
  dateFrom: string,
  dateTo: string
): Promise<{ events: SourceEvent[]; error?: SourceError }> {
  const key = getDtcmKey();
  if (!key) {
    return { events: [], error: { source: "dtcm", error: "DTCM_API_KEY not set" } };
  }

  const base = (
    process.env.DTCM_API_BASE_URL ||
    "https://api.dubai.gov.ae/secure/dubaicalendar/v1"
  ).replace(/\/$/, "");
  const path = process.env.DTCM_EVENTS_PATH || "/events";

  const params = new URLSearchParams({
    startDate: dateFrom,
    endDate: dateTo,
    city,
    language: "en",
  });

  const url = `${base}${path}?${params}`;
  const headerVariants: Record<string, string>[] = [
    { "Ocp-Apim-Subscription-Key": key, Accept: "application/json" },
    { Authorization: `Bearer ${key}`, Accept: "application/json" },
    { "x-api-key": key, Accept: "application/json" },
  ];

  let lastError = "DTCM API unreachable";

  for (const headers of headerVariants) {
    try {
      const data = await fetchJson(url, headers);
      const events = parseApiEvents(data, city, dateFrom, dateTo);
      if (events.length > 0) return { events };
      lastError = "DTCM API returned 0 events for window";
    } catch (err) {
      lastError = (err as Error).message;
    }
  }

  return { events: [], error: { source: "dtcm", error: lastError } };
}

function curatedToSourceEvents(
  city: string,
  dateFrom: string,
  dateTo: string
): SourceEvent[] {
  return getDtcmCuratedEvents(dateFrom, dateTo).map((e) => ({
    title: e.title,
    dateStart: e.dateStart,
    dateEnd: e.dateEnd,
    city,
    url: e.url,
    source: "dtcm" as const,
    venue: "Dubai, UAE",
  }));
}

/**
 * Fetch DTCM events. Live API when keyed; curated DET calendar otherwise.
 * Only call when resolveDtcmEligibility().enabled is true.
 */
export async function dtcmEvents(
  city: string,
  dateFrom: string,
  dateTo: string,
  opts: { preferLiveApi?: boolean } = {}
): Promise<{ events: SourceEvent[]; error?: SourceError; mode: "live" | "curated" }> {
  const preferLive = opts.preferLiveApi !== false && Boolean(getDtcmKey());

  if (preferLive) {
    const live = await fetchDtcmLiveApi(city, dateFrom, dateTo);
    if (live.events.length > 0) {
      return { events: live.events, mode: "live" };
    }
    const curated = curatedToSourceEvents(city, dateFrom, dateTo);
    if (curated.length > 0) {
      return {
        events: curated,
        mode: "curated",
        error: live.error
          ? { source: "dtcm", error: `${live.error.error} — using curated DET calendar` }
          : undefined,
      };
    }
    return { events: [], error: live.error, mode: "live" };
  }

  const curated = curatedToSourceEvents(city, dateFrom, dateTo);
  return {
    events: curated,
    mode: "curated",
    error: curated.length === 0 ? { source: "dtcm", error: "no curated DTCM events in window" } : undefined,
  };
}
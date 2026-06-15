/**
 * Fan-out all integrated Dubai Government event feeds.
 */

import type { SourceEvent, SourceError } from "../sources";
import { getDubaiGovApiKey } from "./client";
import { fetchDtcmCalendarEvents } from "./feeds/dtcm-calendar";
import { fetchDculCulturalEvents } from "./feeds/dcul-cultural-events";
import { getDtcmCuratedEvents } from "../dtcm-curated-calendar";

export interface DubaiGovGatherResult {
  events: SourceEvent[];
  errors: SourceError[];
  modes: {
    dtcm: "live" | "curated" | "skipped";
    dcul: "live" | "skipped";
  };
  hasApiKey: boolean;
}

function curatedFallback(city: string, dateFrom: string, dateTo: string): SourceEvent[] {
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

export async function gatherDubaiGovEvents(
  city: string,
  dateFrom: string,
  dateTo: string
): Promise<DubaiGovGatherResult> {
  const hasApiKey = Boolean(getDubaiGovApiKey());
  const errors: SourceError[] = [];
  const seen = new Set<string>();
  const events: SourceEvent[] = [];

  const push = (list: SourceEvent[]) => {
    for (const e of list) {
      const key = `${e.title.toLowerCase()}|${e.dateStart}|${e.source}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push(e);
    }
  };

  let dtcmMode: DubaiGovGatherResult["modes"]["dtcm"] = "skipped";
  let dculMode: DubaiGovGatherResult["modes"]["dcul"] = "skipped";

  if (hasApiKey) {
    const [dtcmRes, dculRes] = await Promise.all([
      fetchDtcmCalendarEvents(city, dateFrom, dateTo),
      fetchDculCulturalEvents(city, dateFrom, dateTo),
    ]);

    if (dtcmRes.error) errors.push(dtcmRes.error);
    if (dculRes.error) errors.push(dculRes.error);

    if (dtcmRes.events.length > 0) {
      push(dtcmRes.events);
      dtcmMode = "live";
    }
    if (dculRes.events.length > 0) {
      push(dculRes.events);
      dculMode = "live";
    }
  }

  if (events.filter((e) => e.source === "dtcm").length === 0) {
    push(curatedFallback(city, dateFrom, dateTo));
    if (events.some((e) => e.source === "dtcm")) dtcmMode = "curated";
  }

  return { events, errors, modes: { dtcm: dtcmMode, dcul: dculMode }, hasApiKey };
}
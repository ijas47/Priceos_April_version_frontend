/**
 * SDG-DCUL-CulturalEvents - REST cultural events feed.
 * https://developer.dubai.gov.ae/portal/apis/b67333b6-2fbb-494d-9e55-b4d2e082a5f1
 */

import type { SourceEvent, SourceError } from "../../sources";
import { getDubaiGovApiKey, dubaiGovGet } from "../client";
import { parseEventsFromPayload } from "../parse-events";

const BASE_URL =
  process.env.DCUL_EVENTS_BASE_URL ||
  "https://apis.dubai.gov.ae/secure/sdg/dcul/culturalevents/1.0.0";

export async function fetchDculCulturalEvents(
  city: string,
  dateFrom: string,
  dateTo: string
): Promise<{ events: SourceEvent[]; error?: SourceError }> {
  if (!getDubaiGovApiKey()) {
    return { events: [], error: { source: "dcul", error: "DUBAI_GOV_API_KEY not set" } };
  }

  try {
    const data = await dubaiGovGet(BASE_URL, "/Ipass/GetEvents", {
      culture: "en",
    });

    const success = (data as { success?: string })?.success;
    if (success === "false") {
      const msg = String((data as { message?: string }).message || "DCUL API error");
      return { events: [], error: { source: "dcul", error: msg } };
    }

    const events = parseEventsFromPayload(data, city, "dcul", dateFrom, dateTo);
    if (events.length === 0) {
      return { events: [], error: { source: "dcul", error: "DCUL GetEvents returned 0 parseable events" } };
    }

    return { events };
  } catch (err) {
    return { events: [], error: { source: "dcul", error: (err as Error).message } };
  }
}

/** Optional: event category filters for future UI filtering. */
export async function fetchDculEventFilters(): Promise<unknown> {
  if (!getDubaiGovApiKey()) return null;
  try {
    return await dubaiGovGet(BASE_URL, "/Ipass/GetEventFilters", { culture: "en" });
  } catch {
    return null;
  }
}
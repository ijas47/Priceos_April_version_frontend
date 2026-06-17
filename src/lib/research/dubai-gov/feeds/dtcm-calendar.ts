/**
 * SDG-DTCM-CalendarEvents - GraphQL event feed.
 * https://developer.dubai.gov.ae/portal/apis/84994f74-aaa3-4cbe-b2a4-467a8a52ec77
 */

import type { SourceEvent, SourceError } from "../../sources";
import { getDubaiGovApiKey, dubaiGovPost } from "../client";
import { parseEventsFromPayload } from "../parse-events";

const BASE_URL =
  process.env.DTCM_CALENDAR_BASE_URL ||
  "https://apis.dubai.gov.ae/secure/dtcm/calendarevents/1.0.0";

/** GraphQL query variants - portal OpenAPI omits schema; try common shapes. */
const EVENT_QUERIES = [
  `query { events { title name startDate endDate venue { name } url } }`,
  `query { getEvents { title name startDate endDate venue url } }`,
  `query { eventList { eventName startDate endDate venueName eventUrl } }`,
  `query { calendarEvents { title startDate endDate location url } }`,
];

export async function fetchDtcmCalendarEvents(
  city: string,
  dateFrom: string,
  dateTo: string
): Promise<{ events: SourceEvent[]; error?: SourceError }> {
  if (!getDubaiGovApiKey()) {
    return { events: [], error: { source: "dtcm", error: "DUBAI_GOV_API_KEY not set" } };
  }

  const collected: SourceEvent[] = [];
  const seen = new Set<string>();
  let lastError = "DTCM Calendar GraphQL returned no events";

  for (const query of EVENT_QUERIES) {
    try {
      const data = await dubaiGovPost(BASE_URL, "/graphql/event", { query });
      const parsed = parseEventsFromPayload(data, city, "dtcm", dateFrom, dateTo);
      for (const e of parsed) {
        const key = `${e.title}|${e.dateStart}`;
        if (seen.has(key)) continue;
        seen.add(key);
        collected.push(e);
      }
      if (collected.length > 0) break;
    } catch (err) {
      lastError = (err as Error).message;
    }
  }

  if (collected.length === 0) {
    return { events: [], error: { source: "dtcm", error: lastError } };
  }

  return { events: collected };
}
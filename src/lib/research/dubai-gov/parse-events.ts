/**
 * Flexible parsers for Dubai Gov event payloads (GraphQL + REST).
 */

import type { SourceEvent } from "../sources";

const DATE_KEYS = ["startDate", "start_date", "eventStartDate", "fromDate", "start", "EventStartDate", "StartDate"];
const END_KEYS = ["endDate", "end_date", "eventEndDate", "toDate", "end", "EventEndDate", "EndDate"];
const TITLE_KEYS = ["title", "name", "eventName", "eventTitle", "EventName", "EventTitle", "Title"];
const VENUE_KEYS = ["venue", "venueName", "location", "VenueName", "Venue", "eventVenue"];
const URL_KEYS = ["url", "eventUrl", "website", "link", "EventURL", "Url"];

function pickField(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim()) return String(v).trim();
    const nested = row[k.toLowerCase()];
    if (nested != null && String(nested).trim()) return String(nested).trim();
  }
  return "";
}

function normalizeDate(v: string): string {
  const s = v.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return "";
}

function rowToEvent(
  row: Record<string, unknown>,
  city: string,
  source: SourceEvent["source"],
  dateFrom: string,
  dateTo: string
): SourceEvent | null {
  const title = pickField(row, TITLE_KEYS);
  if (!title) return null;

  const start = normalizeDate(pickField(row, DATE_KEYS));
  if (!start) return null;
  const end = normalizeDate(pickField(row, END_KEYS)) || start;
  if (end < dateFrom || start > dateTo) return null;

  let venue = pickField(row, VENUE_KEYS);
  const venueObj = row.venue ?? row.Venue;
  if (!venue && venueObj && typeof venueObj === "object") {
    venue = pickField(venueObj as Record<string, unknown>, ["name", "title", "Name"]);
  }

  return {
    title,
    dateStart: start,
    dateEnd: end,
    venue: venue || undefined,
    city,
    url: pickField(row, URL_KEYS) || undefined,
    source,
    raw: row,
  };
}

function walkForEventArrays(
  node: unknown,
  out: Record<string, unknown>[],
  depth = 0
): void {
  if (depth > 8 || node == null) return;
  if (Array.isArray(node)) {
    for (const item of node) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const r = item as Record<string, unknown>;
        if (pickField(r, TITLE_KEYS)) out.push(r);
        else walkForEventArrays(item, out, depth + 1);
      }
    }
    return;
  }
  if (typeof node === "object") {
    for (const v of Object.values(node as Record<string, unknown>)) {
      walkForEventArrays(v, out, depth + 1);
    }
  }
}

export function parseEventsFromPayload(
  data: unknown,
  city: string,
  source: SourceEvent["source"],
  dateFrom: string,
  dateTo: string
): SourceEvent[] {
  const rows: Record<string, unknown>[] = [];
  walkForEventArrays(data, rows);

  const seen = new Set<string>();
  const events: SourceEvent[] = [];

  for (const row of rows) {
    const ev = rowToEvent(row, city, source, dateFrom, dateTo);
    if (!ev) continue;
    const key = `${ev.title.toLowerCase()}|${ev.dateStart}`;
    if (seen.has(key)) continue;
    seen.add(key);
    events.push(ev);
  }

  return events;
}
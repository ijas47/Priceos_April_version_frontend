/**
 * Dubai Government event feeds (DTCM + DCUL).
 *
 * Delegates to dubai-gov/gather.ts — correct portal bases and x-Gateway-APIKey auth.
 * Curated DET calendar is used when live API is unavailable.
 *
 * Env:
 *   DUBAI_GOV_API_KEY (primary) or DTCM_API_KEY — Dubai Gov portal subscription key
 *   DTCM_CALENDAR_BASE_URL — optional override for DTCM GraphQL base
 *   DCUL_EVENTS_BASE_URL — optional override for DCUL REST base
 */

import type { SourceEvent, SourceError } from "../sources";
import { gatherDubaiGovEvents } from "../dubai-gov/gather";

export type { DubaiGovGatherResult } from "../dubai-gov/gather";

/**
 * Fetch DTCM + DCUL events via Dubai Gov portal.
 * Only call when resolveDtcmEligibility().enabled is true.
 */
export async function dtcmEvents(
  city: string,
  dateFrom: string,
  dateTo: string
): Promise<{
  events: SourceEvent[];
  errors: SourceError[];
  modes: { dtcm: "live" | "curated" | "skipped"; dcul: "live" | "skipped" };
  hasApiKey: boolean;
}> {
  const result = await gatherDubaiGovEvents(city, dateFrom, dateTo);
  return {
    events: result.events,
    errors: result.errors,
    modes: result.modes,
    hasApiKey: result.hasApiKey,
  };
}
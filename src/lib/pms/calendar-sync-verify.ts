import type { HostawayClient } from "@/lib/hostaway/client";

export const DEFAULT_SYNC_TOLERANCE_AED = 1;
export const DEFAULT_VERIFY_RETRY_MS = 1500;
export const DEFAULT_VERIFY_MAX_ATTEMPTS = 3;

export interface CalendarSyncVerification {
  verified: boolean;
  expectedPrice: number;
  actualPrice: number | null;
  mismatchAed: number | null;
  attempts: number;
  verifiedAt: Date;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Read back Hostaway calendar after a push and confirm price within tolerance.
 */
export async function verifyCalendarPush(
  client: HostawayClient,
  hostawayListingId: number,
  date: string,
  expectedPrice: number,
  options?: {
    toleranceAed?: number;
    retryMs?: number;
    maxAttempts?: number;
  }
): Promise<CalendarSyncVerification> {
  const tolerance = options?.toleranceAed ?? DEFAULT_SYNC_TOLERANCE_AED;
  const retryMs = options?.retryMs ?? DEFAULT_VERIFY_RETRY_MS;
  const maxAttempts = options?.maxAttempts ?? DEFAULT_VERIFY_MAX_ATTEMPTS;

  let actualPrice: number | null = null;
  let attempts = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attempts = attempt;
    if (attempt > 1) await sleep(retryMs);

    try {
      const calendar = await client.getCalendar(hostawayListingId, date, date);
      const day = calendar.find((d) => d.date === date);
      actualPrice = day?.price ?? null;

      if (
        actualPrice != null &&
        Math.abs(actualPrice - expectedPrice) <= tolerance
      ) {
        return {
          verified: true,
          expectedPrice,
          actualPrice,
          mismatchAed: 0,
          attempts,
          verifiedAt: new Date(),
        };
      }
    } catch (err) {
      console.warn(
        `[verifyCalendarPush] attempt ${attempt}/${maxAttempts}:`,
        (err as Error).message
      );
    }
  }

  const mismatchAed =
    actualPrice != null ? Math.round(Math.abs(actualPrice - expectedPrice) * 100) / 100 : null;

  return {
    verified: false,
    expectedPrice,
    actualPrice,
    mismatchAed,
    attempts,
    verifiedAt: new Date(),
  };
}
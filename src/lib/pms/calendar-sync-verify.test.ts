import { describe, expect, it, vi } from "vitest";
import { verifyCalendarPush } from "./calendar-sync-verify";
import type { HostawayClient } from "@/lib/hostaway/client";

describe("verifyCalendarPush", () => {
  it("passes when read-back price matches within tolerance", async () => {
    const client = {
      getCalendar: vi
        .fn()
        .mockResolvedValue([{ date: "2026-06-20", price: 500, status: "available", listingId: 1 }]),
    } as unknown as HostawayClient;

    const result = await verifyCalendarPush(client, 1001, "2026-06-20", 500);
    expect(result.verified).toBe(true);
    expect(result.mismatchAed).toBe(0);
  });

  it("fails after retries when price mismatches", async () => {
    const client = {
      getCalendar: vi
        .fn()
        .mockResolvedValue([{ date: "2026-06-20", price: 480, status: "available", listingId: 1 }]),
    } as unknown as HostawayClient;

    const result = await verifyCalendarPush(client, 1001, "2026-06-20", 500, {
      maxAttempts: 1,
      retryMs: 0,
    });
    expect(result.verified).toBe(false);
    expect(result.mismatchAed).toBe(20);
  });
});
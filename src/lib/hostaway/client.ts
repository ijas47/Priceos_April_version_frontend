import type {
  HostawayListing,
  HostawayCalendarDay,
  HostawayReservation,
  HostawayCalendarUpdate,
  HostawayListingUpdate,
  HostawayApiError,
  HostawayRateLimit,
} from "./types";
import { requireHostawayApiBaseUrl } from "@/lib/env";

/**
 * Hostaway writes are disabled unless HOSTAWAY_READ_ONLY is explicitly "false".
 * This guarantees PriceOS never pushes prices or messages by accident.
 */
export function isHostawayReadOnly(): boolean {
  const flag = (process.env.HOSTAWAY_READ_ONLY ?? "true").toLowerCase();
  return flag !== "false" && flag !== "0";
}

/**
 * Guest-message sending is governed by a SEPARATE flag from pricing/calendar
 * writes. Even when HOSTAWAY_READ_ONLY stays true (pricing pushes blocked),
 * an operator can opt in to delivering reviewed guest replies by setting
 * HOSTAWAY_ALLOW_GUEST_SEND=true. Off by default — replies stay local-only.
 */
export function isGuestSendEnabled(): boolean {
  const flag = (process.env.HOSTAWAY_ALLOW_GUEST_SEND ?? "false").toLowerCase();
  return flag === "true" || flag === "1";
}

/** Per-request network timeout (ms) and the cap on 429 retry attempts. */
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RATE_LIMIT_RETRIES = 3;
const MAX_RETRY_WAIT_MS = 30_000;

export class HostawayClient {
  private apiKey: string;
  private rateLimit: HostawayRateLimit | null = null;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    attempt = 0
  ): Promise<T> {
    const HOSTAWAY_API_BASE = requireHostawayApiBaseUrl();
    const url = `${HOSTAWAY_API_BASE}${endpoint}`;

    // Abort the request if Hostaway hangs, so callers never block forever.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...options.headers,
        },
      });

      // Track rate limit headers
      const remaining = response.headers.get("X-RateLimit-Remaining");
      const limit = response.headers.get("X-RateLimit-Limit");
      const reset = response.headers.get("X-RateLimit-Reset");

      if (remaining && limit && reset) {
        this.rateLimit = {
          remaining: parseInt(remaining),
          limit: parseInt(limit),
          reset: parseInt(reset),
        };
      }

      // Handle rate limiting (429) — bounded retries, never unbounded recursion.
      if (response.status === 429) {
        if (attempt >= MAX_RATE_LIMIT_RETRIES) {
          throw {
            status: 429,
            message: `Rate limited by Hostaway after ${MAX_RATE_LIMIT_RETRIES} retries`,
          } as HostawayApiError;
        }
        const retryAfter = response.headers.get("Retry-After");
        const waitTime = Math.min(
          retryAfter ? parseInt(retryAfter) * 1000 : 2000 * (attempt + 1),
          MAX_RETRY_WAIT_MS
        );
        console.warn(
          `Rate limited. Retry ${attempt + 1}/${MAX_RATE_LIMIT_RETRIES} after ${waitTime}ms`
        );
        clearTimeout(timeout);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        return this.request<T>(endpoint, options, attempt + 1);
      }

      // Handle errors
      if (!response.ok) {
        const error: HostawayApiError = {
          status: response.status,
          message: await response.text(),
        };
        throw error;
      }

      const data = await response.json();
      return data.result || data;
    } catch (error) {
      if ((error as HostawayApiError).status) {
        throw error;
      }
      const isAbort = error instanceof Error && error.name === "AbortError";
      throw {
        status: isAbort ? 504 : 500,
        message: isAbort
          ? `Hostaway request timed out after ${REQUEST_TIMEOUT_MS}ms`
          : `Network error: ${(error as Error).message}`,
      } as HostawayApiError;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Fetch all listings from HostAway
   */
  async getListings(): Promise<HostawayListing[]> {
    return this.request<HostawayListing[]>("/listings");
  }

  /**
   * Fetch a single listing by ID
   */
  async getListing(listingId: number, includeResources = true): Promise<HostawayListing> {
    const qs = includeResources ? "?includeResources=1" : "";
    return this.request<HostawayListing>(`/listings/${listingId}${qs}`);
  }

  /**
   * Update listing content fields (partial body).
   * BLOCKED unless HOSTAWAY_READ_ONLY=false.
   */
  async updateListing(listingId: number, body: HostawayListingUpdate): Promise<void> {
    if (isHostawayReadOnly()) {
      throw new Error(
        "[PriceOS] updateListing() blocked — Hostaway is in READ-ONLY mode. " +
          "Set HOSTAWAY_READ_ONLY=false to publish listing content."
      );
    }
    await this.request<void>(`/listings/${listingId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  /**
   * Fetch calendar for a listing (daily rates + availability).
   * Hostaway API uses startDate/endDate query params.
   */
  async getCalendar(
    listingId: number,
    startDate: string,
    endDate: string
  ): Promise<HostawayCalendarDay[]> {
    const params = new URLSearchParams({
      startDate,
      endDate,
    });

    const raw = await this.request<unknown[]>(
      `/listings/${listingId}/calendar?${params}`
    );

    if (!Array.isArray(raw)) return [];
    return raw.map((day) => normalizeHostawayCalendarDay(day, listingId));
  }

  /**
   * Update calendar intervals (batch price updates).
   * BLOCKED unless HOSTAWAY_READ_ONLY=false — PriceOS must never
   * push prices to Hostaway without explicit operator opt-in.
   */
  async updateCalendar(
    listingId: number,
    updates: HostawayCalendarUpdate[]
  ): Promise<void> {
    if (isHostawayReadOnly()) {
      throw new Error(
        "[PriceOS] updateCalendar() blocked — Hostaway is in READ-ONLY mode. " +
        "Set HOSTAWAY_READ_ONLY=false to enable price pushes (not recommended)."
      );
    }
    await this.request<void>(`/listings/${listingId}/calendar/intervals`, {
      method: "PUT",
      body: JSON.stringify({ intervals: updates }),
    });
  }

  /**
   * Send a message into a guest conversation (delivers to the guest's
   * Airbnb/Booking inbox via Hostaway).
   * BLOCKED unless HOSTAWAY_ALLOW_GUEST_SEND=true — replies must never reach
   * a real guest without explicit operator opt-in. Pricing pushes remain
   * separately blocked by HOSTAWAY_READ_ONLY.
   */
  async sendMessage(
    conversationId: string | number,
    body: string,
    communicationType = "channel"
  ): Promise<void> {
    if (!isGuestSendEnabled()) {
      throw new Error(
        "[PriceOS] sendMessage() blocked — HOSTAWAY_ALLOW_GUEST_SEND is not enabled. " +
        "Replies are saved locally only. Set HOSTAWAY_ALLOW_GUEST_SEND=true to deliver to guests."
      );
    }
    await this.request<void>(`/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ body, isIncoming: 0, communicationType }),
    });
  }

  /**
   * Fetch reservations for a listing
   * @param listingId - HostAway listing ID (optional, fetches all if not provided)
   * @param startDate - Filter by arrival date >= startDate (optional)
   * @param endDate - Filter by arrival date <= endDate (optional)
   */
  async getReservations(
    listingId?: number,
    startDate?: string,
    endDate?: string,
    limit = 500
  ): Promise<HostawayReservation[]> {
    const params = new URLSearchParams();
    if (listingId) params.append("listingMapId", listingId.toString());
    if (startDate) params.append("arrivalDateFrom", startDate);
    if (endDate) params.append("arrivalDateTo", endDate);
    params.append("limit", String(limit));

    const query = params.toString() ? `?${params}` : "";
    return this.request<HostawayReservation[]>(`/reservations${query}`);
  }

  /**
   * Verify API key by attempting to fetch listings
   */
  async verifyApiKey(): Promise<boolean> {
    try {
      await this.getListings();
      return true;
    } catch (error) {
      const apiError = error as HostawayApiError;
      if (apiError.status === 401) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get current rate limit status
   */
  getRateLimit(): HostawayRateLimit | null {
    return this.rateLimit;
  }
}

/** Map Hostaway calendar JSON (isAvailable + price) to our normalized day shape. */
export function normalizeHostawayCalendarDay(
  raw: unknown,
  listingId: number
): HostawayCalendarDay {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const date = String(row.date ?? "");
  const price = Number(row.price ?? row.nightlyRate ?? 0);

  let status: HostawayCalendarDay["status"] = "available";
  const rawStatus = row.status;
  if (typeof rawStatus === "string") {
    const s = rawStatus.toLowerCase();
    if (s.includes("book")) status = "booked";
    else if (s.includes("block")) status = "blocked";
    else status = "available";
  } else if (row.isAvailable === 0 || row.isAvailable === false) {
    status = "booked";
  }

  return {
    listingId: Number(row.listingMapId ?? row.listingId ?? listingId),
    date,
    status,
    price,
    minimumStay: row.minimumStay != null ? Number(row.minimumStay) : undefined,
    maximumStay: row.maximumStay != null ? Number(row.maximumStay) : undefined,
    note: typeof row.note === "string" ? row.note : undefined,
    isAvailable: row.isAvailable as number | boolean | undefined,
  };
}

/**
 * Create a HostAway client instance
 */
export function createHostawayClient(apiKey: string): HostawayClient {
  return new HostawayClient(apiKey);
}

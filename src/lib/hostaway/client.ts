import type {
  HostawayListing,
  HostawayCalendarDay,
  HostawayReservation,
  HostawayApiError,
  HostawayRateLimit,
} from "./types";
import { requireHostawayApiBaseUrl } from "@/lib/env";

export class HostawayClient {
  private apiKey: string;
  private rateLimit: HostawayRateLimit | null = null;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const HOSTAWAY_API_BASE = requireHostawayApiBaseUrl();
    const url = `${HOSTAWAY_API_BASE}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
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

      // Handle rate limiting (429)
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 2000;
        console.warn(`Rate limited. Retrying after ${waitTime}ms`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        return this.request<T>(endpoint, options);
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
      throw {
        status: 500,
        message: `Network error: ${(error as Error).message}`,
      } as HostawayApiError;
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
  async getListing(listingId: number): Promise<HostawayListing> {
    return this.request<HostawayListing>(`/listings/${listingId}`);
  }

  /**
   * Fetch calendar for a listing (90-day window)
   * @param listingId - HostAway listing ID
   * @param startDate - Start date (YYYY-MM-DD)
   * @param endDate - End date (YYYY-MM-DD)
   */
  async getCalendar(
    listingId: number,
    startDate: string,
    endDate: string
  ): Promise<HostawayCalendarDay[]> {
    const params = new URLSearchParams({
      listingMapId: listingId.toString(),
      dateFrom: startDate,
      dateTo: endDate,
    });

    return this.request<HostawayCalendarDay[]>(
      `/listings/${listingId}/calendar?${params}`
    );
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
    endDate?: string
  ): Promise<HostawayReservation[]> {
    const params = new URLSearchParams();
    if (listingId) params.append("listingMapId", listingId.toString());
    if (startDate) params.append("arrivalDateFrom", startDate);
    if (endDate) params.append("arrivalDateTo", endDate);

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

/**
 * Create a HostAway client instance
 */
export function createHostawayClient(apiKey: string): HostawayClient {
  return new HostawayClient(apiKey);
}

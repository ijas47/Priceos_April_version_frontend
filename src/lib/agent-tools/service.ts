/**
 * agent-tools/service.ts - FRONTEND PROXY
 *
 * All business logic has been moved to priceos-backend.
 * This module is a thin HTTP client that proxies calls to the FastAPI
 * /api/agent-tools/* endpoints. No direct DB or external API calls here.
 */

const API_BASE =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api"
    : process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

async function apiCall<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Agent tool API error ${res.status}: ${err}`);
  }
  return res.json() as Promise<T>;
}

export function getDateWindowDefaults() {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 30);
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
  };
}

export async function getPortfolioOverview(orgId: string, dateFrom: string, dateTo: string) {
  return apiCall(`/agent-tools/portfolio-overview?orgId=${orgId}&dateFrom=${dateFrom}&dateTo=${dateTo}`);
}

export async function getPortfolioRevenueSnapshot(
  orgId: string,
  dateFrom: string,
  dateTo: string,
  groupBy: "day" | "week" | "property"
) {
  return apiCall(`/agent-tools/revenue-snapshot?orgId=${orgId}&dateFrom=${dateFrom}&dateTo=${dateTo}&groupBy=${groupBy}`);
}

export async function getAgentSystemStatus(orgId: string) {
  return apiCall(`/agent-tools/system-status?orgId=${orgId}`);
}

export async function getPropertyCalendarMetrics(orgId: string, listingId: string, dateFrom: string, dateTo: string) {
  return apiCall(`/agent-tools/calendar-metrics?orgId=${orgId}&listingId=${listingId}&dateFrom=${dateFrom}&dateTo=${dateTo}`);
}

export async function getPropertyProfile(orgId: string, listingId: string) {
  return apiCall(`/agent-tools/property-profile?orgId=${orgId}&listingId=${listingId}`);
}

export async function getPropertyReservations(orgId: string, listingId: string, dateFrom: string, dateTo: string, limit = 50) {
  return apiCall(`/agent-tools/property-reservations?orgId=${orgId}&listingId=${listingId}&dateFrom=${dateFrom}&dateTo=${dateTo}&limit=${limit}`);
}

export async function getPropertyMarketEvents(orgId: string, dateFrom: string, dateTo: string, listingId?: string) {
  const q = new URLSearchParams({ orgId, dateFrom, dateTo });
  if (listingId) q.append("listingId", listingId);
  return apiCall(`/agent-tools/market-events?${q}`);
}

export async function getPropertyBenchmark(orgId: string, listingId: string, dateFrom: string, dateTo: string) {
  return apiCall(`/agent-tools/benchmark?orgId=${orgId}&listingId=${listingId}&dateFrom=${dateFrom}&dateTo=${dateTo}`);
}

export async function listGuestConversations(orgId: string, listingId: string, dateFrom: string, dateTo: string) {
  return apiCall(`/agent-tools/conversations?orgId=${orgId}&listingId=${listingId}&dateFrom=${dateFrom}&dateTo=${dateTo}`);
}

export async function getGuestSummary(orgId: string, listingId: string, dateFrom: string, dateTo: string) {
  return apiCall(`/agent-tools/guest-summary?orgId=${orgId}&listingId=${listingId}&dateFrom=${dateFrom}&dateTo=${dateTo}`);
}

export async function generateAndPersistGuestSummary(orgId: string, listingId: string, dateFrom: string, dateTo: string) {
  return apiCall(`/agent-tools/guest-summary/generate`, {
    method: "POST",
    body: JSON.stringify({ orgId, listingId, dateFrom, dateTo }),
  });
}

export async function suggestGuestReply(params: { guestMessage: string; guestName: string; propertyName?: string }) {
  return apiCall(`/agent-tools/suggest-reply`, {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function saveGuestReply(orgId: string, conversationId: string, text: string) {
  return apiCall(`/agent-tools/save-reply`, {
    method: "POST",
    body: JSON.stringify({ orgId, conversationId, text }),
  });
}

export async function getListingMetadata(orgId: string) {
  return apiCall(`/agent-tools/listing-metadata?orgId=${orgId}`);
}

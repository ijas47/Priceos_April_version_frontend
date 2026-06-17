/**
 * pms/hostaway-client.ts - FRONTEND STUB
 *
 * All direct Hostaway API communication has been moved to the FastAPI backend.
 * The frontend uses these wrapper functions that proxy through /api/hostaway/*.
 *
 * HOSTAWAY_READ_ONLY defaults to "true". When enabled, sendReply() is blocked
 * to prevent accidental guest messages being sent through Hostaway.
 */

const API =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

function isReadOnly(): boolean {
  const flag = (process.env.HOSTAWAY_READ_ONLY ?? "true").toLowerCase();
  return flag !== "false" && flag !== "0";
}

async function hostawayProxy<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}/hostaway${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) throw new Error(`Hostaway proxy error ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function getHostawayConversations(listingId?: string) {
  const q = listingId ? `?listingId=${listingId}` : "";
  return hostawayProxy(`/conversations${q}`);
}

export async function getCachedConversations(listingId?: string) {
  const q = listingId ? `?listingId=${listingId}` : "";
  return hostawayProxy(`/conversations/cached${q}`);
}

export async function getConversationSummary(listingId: string) {
  return hostawayProxy(`/summary?listingId=${listingId}`);
}

export async function suggestReply(params: {
  conversationId: string;
  guestMessage: string;
  guestName: string;
  propertyName?: string;
}) {
  return hostawayProxy(`/suggest-reply`, {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function sendReply(params: {
  conversationId: string;
  message: string;
  listingId?: string;
}) {
  if (isReadOnly()) {
    throw new Error(
      "[PriceOS] sendReply() blocked - HOSTAWAY_READ_ONLY is enabled. " +
      "Set HOSTAWAY_READ_ONLY=false to allow sending guest messages."
    );
  }
  return hostawayProxy(`/reply`, {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function getHostawayMetadata(params: Record<string, string>) {
  const q = new URLSearchParams(params).toString();
  return hostawayProxy(`/metadata?${q}`);
}

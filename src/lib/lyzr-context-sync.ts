/**
 * lyzr-context-sync.ts - FRONTEND STUB
 *
 * Lyzr context management has been moved to the FastAPI backend.
 * This module proxies sync requests to /api/lyzr/* endpoints.
 * No direct Lyzr API calls are made from the frontend.
 */

const API =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

/** Trigger a full Lyzr context sync via the backend */
export async function syncLyzrContext(orgId: string, sessionToken?: string): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await fetch(`${API}/lyzr/sync-context`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      },
      body: JSON.stringify({ orgId }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[lyzr-context-sync] Backend error:", err);
      return { success: false, message: err };
    }
    return res.json();
  } catch (err) {
    console.error("[lyzr-context-sync] Network error:", err);
    return { success: false, message: String(err) };
  }
}

/** Resolve the active Lyzr context ID for an org via the backend */
export async function getOrCreateContextId(orgId: string): Promise<string | null> {
  try {
    const res = await fetch(`${API}/lyzr/context-id?orgId=${orgId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.contextId ?? null;
  } catch {
    return null;
  }
}

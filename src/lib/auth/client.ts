"use client";

// JWT auth is server-side only via httpOnly cookie.
// This client stub keeps any imports from breaking.
export const authClient = {
  getSession: async () => ({ data: null, error: null }),
};

const ORG_HYDRATED_EVENT = "priceos-org-hydrated";

let cachedOrgId: string | null = null;
let resolvePromise: Promise<string | null> | null = null;

/** Persist org id for client components that cannot read httpOnly cookies. */
export function setOrgId(orgId: string): void {
  cachedOrgId = orgId;
  if (typeof window === "undefined") return;
  localStorage.setItem("priceos-orgId", orgId);
  window.dispatchEvent(new CustomEvent(ORG_HYDRATED_EVENT, { detail: { orgId } }));
}

/**
 * Returns the current org's ID from memory, localStorage, or a legacy JWT copy.
 * Prefer resolveOrgId() when null — it hydrates from /api/auth/me (cookie session).
 */
export function getOrgId(): string | null {
  if (cachedOrgId) return cachedOrgId;
  if (typeof window === "undefined") return null;
  const direct = localStorage.getItem("priceos-orgId");
  if (direct) {
    cachedOrgId = direct;
    return direct;
  }
  const token = localStorage.getItem("priceos-token");
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(b64));
    const orgId = (payload.orgId as string) ?? null;
    if (orgId) cachedOrgId = orgId;
    return orgId;
  } catch {
    return null;
  }
}

/** Fetch org id from the server session cookie; caches result for getOrgId(). */
export async function resolveOrgId(): Promise<string | null> {
  const existing = getOrgId();
  if (existing) return existing;

  if (!resolvePromise) {
    resolvePromise = fetch("/api/auth/me", { credentials: "include" })
      .then(async (res) => (res.ok ? res.json() : null))
      .then((data) => {
        const orgId = (data?.user?.orgId as string | undefined) ?? null;
        if (orgId) setOrgId(orgId);
        return orgId;
      })
      .catch(() => null)
      .finally(() => {
        resolvePromise = null;
      });
  }

  return resolvePromise;
}

export function onOrgIdHydrated(listener: (orgId: string) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    const orgId = (event as CustomEvent<{ orgId: string }>).detail?.orgId;
    if (orgId) listener(orgId);
  };
  window.addEventListener(ORG_HYDRATED_EVENT, handler);
  return () => window.removeEventListener(ORG_HYDRATED_EVENT, handler);
}

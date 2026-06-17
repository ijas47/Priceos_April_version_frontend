import { cookies, headers } from "next/headers";
import { verifyAccessToken } from "./jwt";

export const COOKIE_NAME = "priceos-session";

/**
 * Resolve the session token from the cookie (browser requests) or the
 * Authorization: Bearer header (server-to-server fetches from our own
 * server components, which have no cookie jar).
 */
async function resolveToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(COOKIE_NAME)?.value;
  if (fromCookie) return fromCookie;

  const h = await headers();
  const auth = h.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return undefined;
}

export interface SessionPayload {
  userId: string;
  orgId: string;
  email: string;
  role: string;
  isApproved?: boolean;
  onboardingStep?: string;
}

/**
 * Get the current session from the httpOnly cookie.
 * Returns null if no valid session exists.
 */
export async function getSession(): Promise<SessionPayload | null> {
  try {
    const token = await resolveToken();
    if (!token) return null;
    const payload = verifyAccessToken(token) as unknown as SessionPayload;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Require a valid session. Throws if not authenticated.
 * Catch "UNAUTHORIZED" in route handlers to return 401.
 */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHORIZED");
  return session;
}

/** @deprecated Legacy export - kept so old code using `auth.getSession()` doesn't crash */
export const auth = {
  getSession: async () => {
    const session = await getSession();
    return { data: session ? { user: { id: session.userId } } : null, error: null };
  },
};

import { headers } from "next/headers";

/**
 * Resolve the API base to an absolute URL for server-side fetches.
 *
 * NEXT_PUBLIC_API_URL is "/api" in self-hosted mode, which works in the
 * browser but not in Node's fetch (server components / route handlers).
 * This helper derives the deployment origin from request headers so
 * server-side code can call the app's own API routes.
 */
export async function apiBase(): Promise<string> {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? "/api";
  if (raw.startsWith("http")) return raw.replace(/\/$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}${raw}`.replace(/\/$/, "");
}

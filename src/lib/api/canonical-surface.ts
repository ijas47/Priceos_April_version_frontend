import { NextResponse } from "next/server";

/**
 * PriceOS has two API "doors":
 *
 * 1. **Dashboard API** (`/api/*`) — browser session (cookie JWT). For the Next.js UI only.
 * 2. **Agent Tools API** (`/api/agent-tools/*` + `/api/v1/*`) — Lyzr workers & integrations.
 *    Auth: session cookie OR `Authorization: Bearer <AGENT_TOOLS_JWT_SECRET>` + `x-tool-org-id`.
 *
 * External agents and acquisition integrators should use Agent Tools only.
 * Dashboard routes may change without notice.
 */
export const CANONICAL_AGENT_PREFIXES = [
  "/api/agent-tools/",
  "/api/v1/",
] as const;

/** Legacy dashboard paths that duplicate v1 — callers should migrate to v1. */
export const LEGACY_DASHBOARD_ALIASES: Record<string, string> = {
  "/api/chat": "/api/v1/ai/chat",
  "/api/v1/revenue/proposals": "/api/v1/revenue/proposals",
};

export function isCanonicalAgentPath(pathname: string): boolean {
  return CANONICAL_AGENT_PREFIXES.some((p) => pathname.startsWith(p));
}

/** Attach deprecation hint for legacy dashboard endpoints hit by non-browser clients. */
export function withLegacyDashboardHeaders(
  response: NextResponse,
  canonicalPath: string
): NextResponse {
  response.headers.set("X-PriceOS-API-Surface", "dashboard-legacy");
  response.headers.set("Deprecation", "true");
  response.headers.set("Link", `<${canonicalPath}>; rel="successor-version"`);
  return response;
}
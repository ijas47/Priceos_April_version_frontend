import { z } from "zod";
import { getSession, type SessionPayload } from "@/lib/auth/server";
import { apiError } from "@/lib/api/response";
import { formatZodErrors } from "@/lib/validators";
import { toolLogger as log } from "./logger";

const MAX_DATE_WINDOW_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

const TOOL_API_KEY = process.env.AGENT_TOOLS_JWT_SECRET;

export type ObjectIdString = string;

export interface ScopedSession {
  session: SessionPayload;
  orgId: ObjectIdString;
}

/** Mark responses from the canonical external agent API surface. */
export function agentToolsJsonHeaders(): HeadersInit {
  return {
    "X-PriceOS-API-Surface": "agent-tools-v1",
    "Cache-Control": "no-store",
  };
}

export async function requireScopedSession(request?: Request, endpoint = "unknown"): Promise<ScopedSession> {
  if (request) {
    const url = new URL(request.url);

    const authHeader = request.headers.get("authorization") || "";
    const headerToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";
    const queryToken = url.searchParams.get("apiKey") || "";
    const token = headerToken || queryToken;

    if (token) {
      if (TOOL_API_KEY && token === TOOL_API_KEY) {
        const orgIdRaw =
          request.headers.get("x-tool-org-id") ||
          url.searchParams.get("orgId") ||
          "";
        if (orgIdRaw && isObjectId(orgIdRaw)) {
          const orgId = orgIdRaw;
          log.authSuccess(endpoint, orgIdRaw, "api_key");
          return {
            session: {
              userId: orgIdRaw,
              orgId: orgIdRaw,
              email: "tool@system",
              role: "admin",
              isApproved: true,
              onboardingStep: "complete",
            },
            orgId,
          };
        }
        log.authFail(endpoint, `Valid API key but invalid/missing orgId: "${orgIdRaw}"`);
      } else {
        log.authFail(endpoint, "API key mismatch");
      }
      throw new Error("UNAUTHORIZED");
    }
  }

  const session = await getSession();
  if (!session?.orgId) {
    log.authFail(endpoint, "No session cookie or missing orgId in session");
    throw new Error("UNAUTHORIZED");
  }

  log.authSuccess(endpoint, session.orgId, "session_cookie");
  return {
    session,
    orgId: session.orgId,
  };
}

export function getDateDiffDays(dateFrom: string, dateTo: string): number {
  const from = new Date(`${dateFrom}T00:00:00.000Z`);
  const to = new Date(`${dateTo}T00:00:00.000Z`);
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

export function enforceDateWindow(dateFrom: string, dateTo: string) {
  const diff = getDateDiffDays(dateFrom, dateTo);
  if (diff < 0) {
    throw new Error("INVALID_DATE_RANGE");
  }
  if (diff > MAX_DATE_WINDOW_DAYS) {
    throw new Error("DATE_WINDOW_EXCEEDED");
  }
}

export function parseQuery<T extends z.ZodTypeAny>(
  schema: T,
  params: URLSearchParams
): z.infer<T> {
  const raw: Record<string, string> = {};
  params.forEach((value, key) => {
    raw[key] = value;
  });
  return schema.parse(raw);
}

export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  return schema.parse(body);
}

export function isObjectId(value: string) {
  return /^[a-fA-F0-9]{24}$/.test(value);
}

export function toObjectId(value: string) {
  return value;
}

export function handleToolError(error: unknown, endpoint = "unknown") {
  if (error instanceof z.ZodError) {
    const details = formatZodErrors(error);
    log.validationFail(endpoint, details);
    return apiError("VALIDATION_ERROR", "Invalid request parameters", 400, details);
  }

  if (error instanceof Error) {
    if (error.message === "UNAUTHORIZED") {
      log.resError(endpoint, 401, "UNAUTHORIZED", "Unauthorized", 0);
      return apiError("UNAUTHORIZED_SCOPE", "Unauthorized", 401);
    }
    if (error.message === "INVALID_DATE_RANGE") {
      log.resError(endpoint, 400, "INVALID_DATE_RANGE", "dateFrom must be before or equal to dateTo", 0);
      return apiError("VALIDATION_ERROR", "dateFrom must be before or equal to dateTo", 400);
    }
    if (error.message === "DATE_WINDOW_EXCEEDED") {
      log.resError(endpoint, 400, "DATE_WINDOW_EXCEEDED", `Date window > ${MAX_DATE_WINDOW_DAYS}d`, 0);
      return apiError("VALIDATION_ERROR", `Date window cannot exceed ${MAX_DATE_WINDOW_DAYS} days`, 400);
    }
    log.resError(endpoint, 500, "INTERNAL_ERROR", error.message, 0);
    return apiError("INTERNAL_ERROR", error.message, 500);
  }

  log.resError(endpoint, 500, "INTERNAL_ERROR", "Unknown error", 0);
  return apiError("INTERNAL_ERROR", "Unknown error", 500);
}

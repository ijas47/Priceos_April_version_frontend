import { NextResponse } from "next/server";

/**
 * ═══════════════════════════════════════════════════════════
 * PriceOS API - Standardized Response Helpers
 * Every v1 endpoint uses these to ensure consistent JSON format.
 * ═══════════════════════════════════════════════════════════
 */

interface ApiMeta {
    requestId: string;
    timestamp: string;
    [key: string]: unknown;
}

/**
 * Success response - 2xx
 * 
 * @example
 * return apiSuccess({ listings: [...] });
 * // → { status: "success", data: { listings: [...] }, metadata: { requestId: "...", timestamp: "..." } }
 */
export function apiSuccess(data: unknown, meta?: Record<string, unknown>, statusCode = 200) {
    const metadata: ApiMeta = {
        requestId: `req_${crypto.randomUUID().slice(0, 12)}`,
        timestamp: new Date().toISOString(),
        ...meta,
    };

    return NextResponse.json(
        { status: "success", data, metadata },
        { status: statusCode }
    );
}

/**
 * Error response - 4xx / 5xx
 * 
 * @example
 * return apiError("VALIDATION_ERROR", "Message is required", 400);
 * // → { status: "error", error: { code: "VALIDATION_ERROR", message: "..." } }
 */
export function apiError(
    code: string,
    message: string,
    statusCode: number,
    details?: unknown
) {
    return NextResponse.json(
        {
            status: "error",
            error: {
                code,
                message,
                ...(details ? { details } : {}),
            },
        },
        { status: statusCode }
    );
}

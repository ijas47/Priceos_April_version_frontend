import { apiSuccess, apiError } from "@/lib/api/response";
import { triggerSyncSchema, formatZodErrors } from "@/lib/validators";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/api/rate-limit";

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";

/**
 * POST /api/v1/system/sync
 * 
 * Proxies a sync request to the Python backend.
 */
export async function POST(req: Request) {
    const ip = getClientIp(req);

    // ── Rate Limiting (Heavy Tier) ──
    const rateCheck = checkRateLimit(`system-sync:${ip}`, RATE_LIMITS.heavy);
    if (!rateCheck.allowed) {
        return apiError("RATE_LIMITED", `Sync limit reached. Try again in ${Math.ceil(rateCheck.resetMs / 1000)}s.`, 429);
    }

    try {
        const body = await req.json();
        const validation = triggerSyncSchema.safeParse(body);

        if (!validation.success) {
            return apiError("VALIDATION_ERROR", "Invalid sync request", 400, formatZodErrors(validation.error));
        }

        const { entity, listingId } = validation.data;

        // Proxy to Python backend
        const pythonResponse = await fetch(`${PYTHON_BACKEND_URL}/api/sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                user_id: "system", // Should be identified by JWT in future
                listing_id: listingId || null,
                context: entity,
            }),
        });

        const pythonData = await pythonResponse.json();

        if (!pythonResponse.ok) {
            return apiError("AI_SERVICE_ERROR", pythonData.detail || "Python backend error", 502);
        }

        return apiSuccess({
            message: "Sync task strictly initiated in the background.",
            jobId: pythonData.job_id || "sync_started",
            details: pythonData
        });

    } catch (error: any) {
        console.error("❌ [v1/system/sync POST] Error:", error);
        return apiError("INTERNAL_ERROR", "Failed to start sync task", 500);
    }
}

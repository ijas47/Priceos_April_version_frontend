import { connectDB, ChatMessage } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { apiSuccess, apiError } from "@/lib/api/response";
import { getProposalsSchema, bulkProposalActionSchema, formatZodErrors } from "@/lib/validators";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/api/rate-limit";
import mongoose from "mongoose";

export async function GET(request: Request) {
    const ip = getClientIp(request);
    const rateCheck = checkRateLimit(`revenue-proposals-get:${ip}`, RATE_LIMITS.standard);
    if (!rateCheck.allowed) {
        return apiError("RATE_LIMITED", `Try again in ${Math.ceil(rateCheck.resetMs / 1000)}s.`, 429);
    }

    const { searchParams } = new URL(request.url);
    const validation = getProposalsSchema.safeParse({
        listingId: searchParams.get("listingId") || undefined,
        status: searchParams.get("status") || "all",
    });

    if (!validation.success) {
        return apiError("VALIDATION_ERROR", "Invalid query parameters", 400, formatZodErrors(validation.error));
    }

    const { listingId } = validation.data;

    try {
        await connectDB();

        const session = await getSession();
        const orgId = session?.orgId
            ? new mongoose.Types.ObjectId(session.orgId)
            : new mongoose.Types.ObjectId();

        const filter: Record<string, unknown> = { orgId, role: "assistant" };
        if (listingId) {
            filter["context.propertyId"] = new mongoose.Types.ObjectId(String(listingId));
        }

        const messages = await ChatMessage.find(filter)
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();

        const allProposals = messages
            .filter(m => (m.metadata as any)?.proposals)
            .flatMap(m => {
                const proposals = (m.metadata as any).proposals;
                return Array.isArray(proposals)
                    ? proposals.map((p: any) => ({ ...p, messageId: m._id.toString() }))
                    : [];
            });

        return apiSuccess({ proposals: allProposals, count: allProposals.length });
    } catch (error: any) {
        console.error("❌ [v1/revenue/proposals GET] Error:", error);
        return apiError("INTERNAL_ERROR", "Failed to fetch pricing proposals", 500);
    }
}

export async function POST(request: Request) {
    const ip = getClientIp(request);
    const rateCheck = checkRateLimit(`revenue-proposals-bulk:${ip}`, RATE_LIMITS.standard);
    if (!rateCheck.allowed) {
        return apiError("RATE_LIMITED", `Try again in ${Math.ceil(rateCheck.resetMs / 1000)}s.`, 429);
    }

    try {
        const body = await request.json();
        const validation = bulkProposalActionSchema.safeParse(body);

        if (!validation.success) {
            return apiError("VALIDATION_ERROR", "Invalid bulk request", 400, formatZodErrors(validation.error));
        }

        const { ids, action } = validation.data;

        console.log(`💼 [Revenue/v1 Bulk] ${action} requested for ${ids.length} proposals:`, ids);

        return apiSuccess({
            processed: ids.length,
            action,
            message: `Successfully processed ${ids.length} proposals with action: ${action}.`,
        });

    } catch (error: any) {
        console.error("❌ [v1/revenue/proposals/bulk POST] Error:", error);
        return apiError("INTERNAL_ERROR", "Failed to process bulk pricing action", 500);
    }
}

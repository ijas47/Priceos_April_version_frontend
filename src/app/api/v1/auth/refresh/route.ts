import { connectDB, Organization } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api/response";
import { refreshSchema, formatZodErrors } from "@/lib/validators";
import { signAccessToken, verifyRefreshToken } from "@/lib/auth/jwt";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/api/rate-limit";
import mongoose from "mongoose";

export async function POST(req: Request) {
    const ip = getClientIp(req);
    const rateCheck = checkRateLimit(`auth-refresh:${ip}`, RATE_LIMITS.auth);
    if (!rateCheck.allowed) {
        return apiError("RATE_LIMITED", `Too many requests. Try again in ${Math.ceil(rateCheck.resetMs / 1000)}s.`, 429);
    }

    try {
        const body = await req.json();
        const validation = refreshSchema.safeParse(body);

        if (!validation.success) {
            return apiError("VALIDATION_ERROR", "Invalid input", 400, formatZodErrors(validation.error));
        }

        const { refreshToken } = validation.data;

        let payload: any;
        try {
            payload = verifyRefreshToken(refreshToken);
        } catch {
            return apiError("UNAUTHORIZED", "Invalid or expired refresh token", 401);
        }

        const { userId } = payload;

        await connectDB();
        const org = await Organization.findById(
            new mongoose.Types.ObjectId(userId)
        ).lean();

        if (!org || org.refreshToken !== refreshToken) {
            return apiError("UNAUTHORIZED", "Refresh token mismatch or user not found", 401);
        }

        const accessToken = signAccessToken({
            userId: org._id.toString(),
            orgId: org._id.toString(),
            email: org.email,
            role: org.role,
        });

        return apiSuccess({ accessToken });

    } catch (e: any) {
        console.error("Refresh v1 Error:", e);
        return apiError("INTERNAL_ERROR", "An unexpected error occurred", 500);
    }
}

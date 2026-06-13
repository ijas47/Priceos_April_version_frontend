import { connectDB, Organization } from "@/lib/db";
import bcrypt from "bcryptjs";
import { apiSuccess, apiError } from "@/lib/api/response";
import { loginSchema, formatZodErrors } from "@/lib/validators";
import { signAccessToken, signRefreshToken } from "@/lib/auth/jwt";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/api/rate-limit";

export async function POST(req: Request) {
    const ip = getClientIp(req);
    const rateCheck = checkRateLimit(`auth-login:${ip}`, RATE_LIMITS.auth);
    if (!rateCheck.allowed) {
        return apiError("RATE_LIMITED", `Too many login attempts. Try again in ${Math.ceil(rateCheck.resetMs / 1000)}s.`, 429);
    }

    try {
        const body = await req.json();
        const validation = loginSchema.safeParse(body);

        if (!validation.success) {
            return apiError("VALIDATION_ERROR", "Invalid input", 400, formatZodErrors(validation.error));
        }

        const { username, password } = validation.data;
        const cleanUsername = username.trim().toLowerCase();

        await connectDB();

        const org = await Organization.findOne({ email: cleanUsername }).lean();

        if (!org || !org.passwordHash) {
            return apiError("UNAUTHORIZED", "Invalid credentials", 401);
        }

        const isPasswordValid = await bcrypt.compare(password, org.passwordHash);
        if (!isPasswordValid) {
            return apiError("UNAUTHORIZED", "Invalid credentials", 401);
        }

        if (!org.isApproved) {
            return apiError("FORBIDDEN", "Account pending approval", 403);
        }

        const orgId = org._id.toString();
        const accessToken = signAccessToken({ userId: orgId, orgId, email: org.email, role: org.role });
        const refreshToken = signRefreshToken(orgId);

        await Organization.findByIdAndUpdate(org._id, { $set: { refreshToken } });

        return apiSuccess({
            user: {
                username: org.email,
                fullName: org.fullName || org.name,
                role: org.role,
                isApproved: org.isApproved,
            },
            tokens: { accessToken, refreshToken },
        });

    } catch (e: any) {
        console.error("[Auth/Login]", e.message);
        return apiError("INTERNAL_ERROR", "An unexpected error occurred", 500);
    }
}

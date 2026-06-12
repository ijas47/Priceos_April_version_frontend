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

        console.log(`🔍 [Auth/Login] Searching for user: ${cleanUsername}`);
        let org = await Organization.findOne({ email: cleanUsername }).lean();

        // Auto-seed test users if not found
        const testUsernames = ['rohith@example.com', 'ram@gmail.com'];
        if (!org && testUsernames.includes(cleanUsername)) {
            console.log(`🌱 [Auth/Login] Seeding test user: ${cleanUsername}`);
            try {
                const passwordHash = await bcrypt.hash('Password@123', 10);
                org = await Organization.create({
                    name: cleanUsername.split('@')[0],
                    email: cleanUsername,
                    passwordHash,
                    fullName: cleanUsername.split('@')[0],
                    role: 'owner',
                    isApproved: true,
                });
                console.log(`✅ [Auth/Login] User seeded: ${org._id}`);
            } catch (seedErr: any) {
                console.error(`❌ [Auth/Login] Seeding failed: ${seedErr.message}`, seedErr);
                throw seedErr;
            }
        }

        if (!org || !org.passwordHash) {
            console.log(`❌ [Auth/Login] User not found for: ${cleanUsername}`);
            return apiError("UNAUTHORIZED", "Invalid credentials", 401);
        }

        const isPasswordValid = await bcrypt.compare(password, org.passwordHash);
        if (!isPasswordValid) {
            console.log(`❌ [Auth/Login] Password mismatch for: ${cleanUsername}`);
            return apiError("UNAUTHORIZED", "Invalid credentials", 401);
        }

        if (!org.isApproved) {
            return apiError("FORBIDDEN", "Account pending approval", 403);
        }

        const orgId = org._id.toString();
        console.log(`🎫 [Auth/Login] Generating tokens for: ${orgId}`);
        const accessToken = signAccessToken({ userId: orgId, orgId, email: org.email, role: org.role });
        const refreshToken = signRefreshToken(orgId);

        await Organization.findByIdAndUpdate(org._id, { $set: { refreshToken } });

        console.log(`🚀 [Auth/Login] Login successful for: ${org.email}`);
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
        console.error("❌ [Auth/Login] Unexpected Error:", e.name, e.message);
        return apiError("INTERNAL_ERROR", `An unexpected error occurred: ${e.message}`, 500);
    }
}

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "priceos-session";

/**
 * Resolve the HS256 signing key. Mirrors src/lib/auth/jwt.ts getSecret():
 * a stable dev-only fallback outside production, fail-closed in production.
 */
function getSecretKey(): Uint8Array {
  const secret =
    process.env.JWT_SECRET ||
    (process.env.NODE_ENV !== "production" ? "dev-only-insecure-JWT_SECRET" : "");
  if (!secret) {
    throw new Error("JWT_SECRET must be set in production");
  }
  return new TextEncoder().encode(secret);
}

const PUBLIC_PATHS = [
  "/login",
  "/waitlist",
  "/pending-approval",
  "/onboarding",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/refresh",
  "/api/auth/check-approval",
  "/api/auth/change-password",
  "/auth/change-password",
  "/api/onboarding",
  "/api/hostaway/metadata",
  "/api/sync/run",          // needed by Go Live step
  "/api/v1/auth",
  "/api/agent-tools/v1",   // Bearer-token auth handled inside each route
  "/api/webhooks/hostaway", // secret-verified inside the route
];

// Extra paths allowed DURING onboarding (user is authenticated but not complete)
const ONBOARDING_ALLOWED_PATHS = [
  "/onboarding",
  "/api/onboarding",
  "/api/hostaway/metadata",
  "/api/sync/run",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/onboarding/auto-setup",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

interface JwtPayload {
  exp?: number;
  isApproved?: boolean;
  onboardingStep?: string;
  mustChangePassword?: boolean;
}

/**
 * Verify the JWT signature AND expiry. Returns the decoded payload only if
 * the token is cryptographically valid. Algorithm is pinned to HS256 to
 * prevent "alg: none" / algorithm-confusion forgery.
 *
 * NOTE: this replaces the previous decode-only check, which trusted any
 * structurally-valid token and allowed trivially forged sessions.
 */
async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    });
    return payload as JwtPayload;
  } catch {
    return null;
  }
}

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static assets - always allow
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icon.png") ||
    pathname.startsWith("/apple-icon")
  ) {
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Cookie for browser requests; Authorization: Bearer for server-to-server
  // fetches from our own server components (which have no cookie jar).
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  const token = request.cookies.get(COOKIE_NAME)?.value ?? bearer;
  const jwtPayload = token ? await verifyToken(token) : null;
  const valid = jwtPayload !== null;
  // Legacy tokens (issued before onboardingStep was added) → treat as approved+complete
  const isApproved = jwtPayload?.isApproved ?? true;
  const onboardingStep = jwtPayload?.onboardingStep ?? "complete";
  const mustChangePassword = jwtPayload?.mustChangePassword === true;
  const changePasswordAllowed =
    pathname.startsWith("/auth/change-password") ||
    pathname.startsWith("/api/auth/change-password") ||
    pathname.startsWith("/api/auth/logout");

  if (valid && mustChangePassword && !changePasswordAllowed) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Password change required", code: "PASSWORD_CHANGE_REQUIRED" },
        { status: 403 }
      );
    }
    return NextResponse.redirect(new URL("/auth/change-password", request.url));
  }

  // Root redirect
  if (pathname === "/") {
    if (!valid) return NextResponse.redirect(new URL("/login", request.url));
    if (!isApproved) return NextResponse.redirect(new URL("/pending-approval", request.url));
    if (onboardingStep !== "complete") return NextResponse.redirect(new URL("/onboarding", request.url));
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // API routes - return 401 JSON instead of redirect
  if (pathname.startsWith("/api/") && !valid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Page routes - redirect to login if not authenticated
  if (!valid) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Authenticated but not yet approved → only allow /pending-approval
  if (valid && !isApproved && !pathname.startsWith("/pending-approval")) {
    return NextResponse.redirect(new URL("/pending-approval", request.url));
  }

  // Approved but onboarding not complete → redirect to /onboarding
  // Allow /onboarding itself plus all API routes needed by the wizard
  const isOnboardingAllowed = ONBOARDING_ALLOWED_PATHS.some(p => pathname.startsWith(p));
  if (valid && isApproved && onboardingStep !== "complete" && !isOnboardingAllowed) {
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }

  // Already approved + complete - don't show pending page or login
  if (valid && isApproved && pathname === "/pending-approval") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  if (valid && isApproved && pathname === "/login") {
    return NextResponse.redirect(new URL(onboardingStep !== "complete" ? "/onboarding" : "/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|favicon\\.png|icon\\.png|apple-icon\\.png).*)",
  ],
};

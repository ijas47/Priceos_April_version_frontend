import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "priceos-session";

const PUBLIC_PATHS = [
  "/login",
  "/waitlist",
  "/pending-approval",
  "/onboarding",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/refresh",
  "/api/auth/check-approval",
  "/api/onboarding",
  "/api/hostaway/metadata",
  "/api/sync/run",          // needed by Go Live step
  "/api/v1/auth",
  "/api/debug",             // dev-only reset tools
  "/api/agent-tools/v1",   // Bearer-token auth handled inside each route
];

// Extra paths allowed DURING onboarding (user is authenticated but not complete)
const ONBOARDING_ALLOWED_PATHS = [
  "/onboarding",
  "/api/onboarding",
  "/api/hostaway/metadata",
  "/api/sync/run",
  "/api/auth/logout",
  "/api/auth/me",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

interface JwtPayload {
  exp?: number;
  isApproved?: boolean;
  onboardingStep?: string;
}

function decodeToken(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch (err) {
    console.log("[Middleware] decodeToken error:", err);
    return null;
  }
}

function isValidToken(token: string): boolean {
  const payload = decodeToken(token);
  if (!payload) return false;
  if (payload.exp) {
    const now = Math.floor(Date.now() / 1000);
    return payload.exp > now;
  }
  return true;
}

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static assets — always allow
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
  const valid = token ? isValidToken(token) : false;
  const jwtPayload = token ? decodeToken(token) : null;
  // Legacy tokens (issued before onboardingStep was added) → treat as approved+complete
  const isApproved = jwtPayload?.isApproved ?? true;
  const onboardingStep = jwtPayload?.onboardingStep ?? "complete";

  // Root redirect
  if (pathname === "/") {
    if (!valid) return NextResponse.redirect(new URL("/login", request.url));
    if (!isApproved) return NextResponse.redirect(new URL("/pending-approval", request.url));
    if (onboardingStep !== "complete") return NextResponse.redirect(new URL("/onboarding", request.url));
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // API routes — return 401 JSON instead of redirect
  if (pathname.startsWith("/api/") && !valid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Page routes — redirect to login if not authenticated
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

  // Already approved + complete — don't show pending page or login
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

import jwt from "jsonwebtoken";

/**
 * Resolve a secret lazily (at sign/verify time, not import time) so the build
 * doesn't crash, while still failing fast at runtime in production if unset.
 * The dev fallback is stable (no timestamp) so tokens stay verifiable.
 */
function getSecret(name: string): string {
  const v = process.env[name];
  if (v) return v;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} must be set in production`);
  }
  return `dev-only-insecure-${name}`;
}

export interface TokenPayload {
  userId: string;
  orgId: string;
  email: string;
  role: string;
  isApproved?: boolean;
  onboardingStep?: string;
  mustChangePassword?: boolean;
}

/**
 * Sign an Access Token - stored in httpOnly cookie "priceos-session".
 * Expiry: 7 days (long-lived for convenience in single-user orgs).
 */
export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, getSecret("JWT_SECRET"), { expiresIn: "7d" });
}

/**
 * Sign a Refresh Token - stored in httpOnly cookie "priceos-refresh".
 */
export function signRefreshToken(userId: string): string {
  return jwt.sign({ userId }, getSecret("JWT_REFRESH_SECRET"), { expiresIn: "30d" });
}

/**
 * Verify and decode an Access Token.
 * Throws if invalid or expired.
 */
export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, getSecret("JWT_SECRET")) as TokenPayload;
}

/**
 * Verify and decode a Refresh Token.
 * Throws if invalid or expired.
 */
export function verifyRefreshToken(token: string): { userId: string } {
  return jwt.verify(token, getSecret("JWT_REFRESH_SECRET")) as { userId: string };
}

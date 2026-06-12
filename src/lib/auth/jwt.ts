import jwt from "jsonwebtoken";

const JWT_SECRET =
  process.env.JWT_SECRET || "priceos_dev_secret_replace_in_production";
const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ||
  "priceos_dev_refresh_secret_replace_in_production";

export interface TokenPayload {
  userId: string;
  orgId: string;
  email: string;
  role: string;
  isApproved?: boolean;
  onboardingStep?: string;
}

/**
 * Sign an Access Token — stored in httpOnly cookie "priceos-session".
 * Expiry: 7 days (long-lived for convenience in single-user orgs).
 */
export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

/**
 * Sign a Refresh Token — stored in httpOnly cookie "priceos-refresh".
 */
export function signRefreshToken(userId: string): string {
  return jwt.sign({ userId }, JWT_REFRESH_SECRET, { expiresIn: "30d" });
}

/**
 * Verify and decode an Access Token.
 * Throws if invalid or expired.
 */
export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

/**
 * Verify and decode a Refresh Token.
 * Throws if invalid or expired.
 */
export function verifyRefreshToken(token: string): { userId: string } {
  return jwt.verify(token, JWT_REFRESH_SECRET) as { userId: string };
}

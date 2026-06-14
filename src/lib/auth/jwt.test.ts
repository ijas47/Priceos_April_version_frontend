import { describe, it, expect, beforeAll } from "vitest";
import {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type TokenPayload,
} from "./jwt";

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  process.env.JWT_REFRESH_SECRET = "test-refresh-bbbbbbbbbbbbbbbbbbbbbbbbbbbb";
});

const payload: TokenPayload = {
  userId: "u1",
  orgId: "org1",
  email: "a@b.com",
  role: "owner",
  isApproved: true,
  onboardingStep: "complete",
};

describe("jwt", () => {
  it("round-trips an access token", () => {
    const token = signAccessToken(payload);
    const decoded = verifyAccessToken(token);
    expect(decoded.userId).toBe("u1");
    expect(decoded.orgId).toBe("org1");
    expect(decoded.role).toBe("owner");
  });

  it("rejects a token signed with the wrong secret (forgery)", () => {
    const token = signAccessToken(payload);
    // Tamper: flip the signature segment.
    const parts = token.split(".");
    parts[2] = parts[2].slice(0, -2) + (parts[2].endsWith("a") ? "bb" : "aa");
    const forged = parts.join(".");
    expect(() => verifyAccessToken(forged)).toThrow();
  });

  it("rejects a structurally-valid but unsigned-payload token", () => {
    // A handcrafted token with alg=none style payload must not verify.
    const fake =
      "eyJhbGciOiJub25lIn0." +
      Buffer.from(JSON.stringify(payload)).toString("base64url") +
      ".";
    expect(() => verifyAccessToken(fake)).toThrow();
  });

  it("round-trips a refresh token", () => {
    const token = signRefreshToken("u1");
    expect(verifyRefreshToken(token).userId).toBe("u1");
  });
});

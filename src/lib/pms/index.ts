import { PMSClient } from "./types";
import { MockPMSClient } from "./mock-client";

/**
 * PMS Client Factory
 * HOSTAWAY_MODE=mock|live|db (default: db)
 *
 * - "db"   → DbPMSClient (delegates to backend/Neon Postgres)
 * - "mock" → MockPMSClient (in-memory arrays)
 * - "live" → LivePMSClient (real Hostaway API, READ-ONLY by default)
 */

export function createPMSClient(): PMSClient {
  const mode = (process.env.HOSTAWAY_MODE || "db").toLowerCase();

  if (mode === "live") {
    const apiKey = process.env.HOSTAWAY_API_KEY || process.env.Hostaway_Authorization_token;
    if (!apiKey) {
      console.warn("[PMS] HOSTAWAY_MODE=live but no Hostaway token is set — falling back to mock");
      return new MockPMSClient();
    }
    // Dynamic import to avoid pulling Hostaway deps into mock/db builds
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { LivePMSClient } = require("./live-client") as typeof import("./live-client");
    return new LivePMSClient(apiKey);
  }

  if (mode === "mock") {
    return new MockPMSClient();
  }

  // Default to DB client, but fall back to mock if no DATABASE_URL
  if (!process.env.DATABASE_URL) {
    return new MockPMSClient();
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DbPMSClient } = require("./db-client") as typeof import("./db-client");
  return new DbPMSClient();
}

export type { PMSClient } from "./types";
export { MockPMSClient } from "./mock-client";

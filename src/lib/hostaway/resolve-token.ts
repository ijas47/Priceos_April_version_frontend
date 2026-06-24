import { connectDB, Organization } from "@/lib/db";
import { getHostawayApiKey } from "@/lib/env";

const TOKEN_URL = "https://api.hostaway.com/v1/accessTokens";

export async function exchangeHostawayOAuthToken(
  accountId: string,
  clientSecret: string
): Promise<string> {
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: accountId.trim(),
      client_secret: clientSecret.trim(),
      scope: "general",
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => "");
    throw new Error(
      `Hostaway OAuth failed (${tokenRes.status})${body ? `: ${body.slice(0, 120)}` : ""}`
    );
  }

  const tokenData = (await tokenRes.json()) as { access_token?: string };
  if (!tokenData.access_token) {
    throw new Error("Hostaway OAuth returned no access_token");
  }

  return tokenData.access_token;
}

/**
 * Resolve a Hostaway bearer token for an organization.
 * Prefers org credentials (OAuth exchange when account ID present), then global env fallback.
 */
export async function resolveHostawayAccessToken(orgId: string): Promise<string> {
  await connectDB();
  const org = await Organization.findById(orgId)
    .select("hostawayApiKey hostawayAccountId")
    .lean();

  const orgSecret = org?.hostawayApiKey?.trim();
  const accountId = org?.hostawayAccountId?.trim();

  if (orgSecret && accountId) {
    return exchangeHostawayOAuthToken(accountId, orgSecret);
  }

  if (orgSecret) {
    return orgSecret;
  }

  const global = getHostawayApiKey();
  if (global) {
    return global;
  }

  throw new Error(
    "No Hostaway credentials configured. Save Account ID and API Secret in Settings → Connections, then try again."
  );
}
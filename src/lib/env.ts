type EnvValue = string | undefined;

function readEnv(name: string): EnvValue {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function getEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = readEnv(name);
    if (value) return value;
  }
  return undefined;
}

export function requireEnv(...names: string[]): string {
  const value = getEnv(...names);
  if (value) return value;
  throw new Error(`Missing required environment variable: ${names.join(" or ")}`);
}

export function getJwtSecrets() {
  return {
    access: requireEnv("JWT_SECRET"),
    refresh: requireEnv("JWT_REFRESH_SECRET"),
  };
}

// Lyzr API calls are handled exclusively by the FastAPI backend.
// The frontend never calls Lyzr directly - do not add Lyzr env vars here.

export function requireHostawayApiBaseUrl() {
  // Public constant - only override for testing against a sandbox.
  return getEnv("HOSTAWAY_API_BASE_URL") ?? "https://api.hostaway.com/v1";
}

/** Hostaway access token - supports both env names in circulation. */
export function getHostawayApiKey() {
  return getEnv("HOSTAWAY_API_KEY", "Hostaway_Authorization_token");
}

export function getDemoSeedCredentials() {
  return {
    email: getEnv("DEMO_EMAIL"),
    password: getEnv("DEMO_PASSWORD"),
  };
}

/**
 * Next.js instrumentation hook - runs once at server startup before any routes are served.
 * Validates that all required environment variables are present so the app fails fast
 * with a clear message rather than crashing on the first request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Some Node environments inject a non-standard `localStorage` (e.g. via `--localstorage-file`).
  // If it's present but not web-compatible, it can crash server rendering when libraries probe it.
  const maybeLocalStorage = (globalThis as unknown as { localStorage?: unknown }).localStorage as any;
  if (maybeLocalStorage && typeof maybeLocalStorage.getItem !== "function") {
    try {
      // Prefer removing it so libs treat it as unavailable on the server.
       
      delete (globalThis as any).localStorage;
    } catch {
      (globalThis as any).localStorage = undefined;
    }
  }

  // Only validate vars the frontend actually uses.
  // MONGODB_URI, JWT_REFRESH_SECRET, LYZR_API_KEY, LYZR_API_URL all belong
  // in the FastAPI backend - the frontend never calls Lyzr or MongoDB directly.
  const required: Record<string, string> = {
    NEXT_PUBLIC_API_URL: "FastAPI backend base URL (e.g. http://localhost:8000/api)",
    JWT_SECRET: "JWT signing secret - must match the backend's JWT_SECRET",
  };

  const missing: string[] = [];

  for (const [name, description] of Object.entries(required)) {
    const value = process.env[name];
    if (!value || value.trim().length === 0) {
      missing.push(`  ${name} - ${description}`);
    }
  }

  if (missing.length > 0) {
    const list = missing.join("\n");
    throw new Error(
      `\n\nMissing required environment variables. Add these to .env.local (dev) or your hosting provider (prod):\n\n${list}\n\nSee docs/environments.md for setup instructions.\n`
    );
  }
}

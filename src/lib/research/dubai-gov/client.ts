/**
 * Shared HTTP client for Dubai Government Developer Portal APIs.
 * Auth: x-Gateway-APIKey header (register at developer.dubai.gov.ae).
 */

export function getDubaiGovApiKey(): string | undefined {
  return (
    process.env.DUBAI_GOV_API_KEY?.trim() ||
    process.env.DTCM_API_KEY?.trim() ||
    process.env.DTCM_SUBSCRIPTION_KEY?.trim() ||
    undefined
  );
}

export function dubaiGovHeaders(): Record<string, string> {
  const key = getDubaiGovApiKey();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (key) headers["x-Gateway-APIKey"] = key;
  return headers;
}

export async function dubaiGovFetch(
  url: string,
  init?: RequestInit,
  timeoutMs = 20000
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      headers: { ...dubaiGovHeaders(), ...(init?.headers as Record<string, string>) },
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function dubaiGovGet(baseUrl: string, path: string, params?: Record<string, string>) {
  const base = baseUrl.replace(/\/$/, "");
  const qs = params ? `?${new URLSearchParams(params)}` : "";
  return dubaiGovFetch(`${base}${path}${qs}`, { method: "GET" });
}

export async function dubaiGovPost(baseUrl: string, path: string, body: unknown) {
  const base = baseUrl.replace(/\/$/, "");
  return dubaiGovFetch(`${base}${path}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
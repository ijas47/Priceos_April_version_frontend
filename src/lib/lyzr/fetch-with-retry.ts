/**
 * Resilient fetch for Lyzr / external agent APIs on serverless.
 * Retries transient socket resets and gateway errors.
 */

const RETRYABLE_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "ENOTFOUND",
  "EAI_AGAIN",
]);

function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as NodeJS.ErrnoException).code;
  if (code && RETRYABLE_CODES.has(code)) return true;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("econnreset") ||
    msg.includes("socket hang up") ||
    msg.includes("network") ||
    err.name === "AbortError"
  );
}

function isRetryableStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: {
    retries?: number;
    baseDelayMs?: number;
    timeoutMs?: number;
    label?: string;
  } = {}
): Promise<Response> {
  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1200;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const label = options.label ?? "fetch";

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (isRetryableStatus(response.status) && attempt < retries - 1) {
        await sleep(baseDelayMs * (attempt + 1));
        continue;
      }

      return response;
    } catch (err) {
      clearTimeout(timer);
      lastError = err instanceof Error ? err : new Error(String(err));

      if (!isRetryableError(err) || attempt === retries - 1) {
        console.error(`[${label}] failed after ${attempt + 1} attempt(s):`, lastError.message);
        throw lastError;
      }

      console.warn(
        `[${label}] attempt ${attempt + 1}/${retries} failed (${lastError.message}), retrying…`
      );
      await sleep(baseDelayMs * (attempt + 1));
    }
  }

  throw lastError ?? new Error(`${label} failed`);
}

export function toUserFacingAgentError(err: unknown): string {
  if (!(err instanceof Error)) return "AI agent is temporarily unavailable. Please try again.";

  const code = (err as NodeJS.ErrnoException).code;
  const msg = err.message.toLowerCase();

  if (
    code === "ECONNRESET" ||
    msg.includes("econnreset") ||
    msg.includes("socket hang up") ||
    err.name === "AbortError" ||
    msg.includes("timed out")
  ) {
    return "Connection to the AI agent was interrupted. Please try again in a few seconds.";
  }

  if (err.message.includes("temporarily unavailable")) {
    return err.message;
  }

  return "AI agent is temporarily unavailable. Please try again.";
}
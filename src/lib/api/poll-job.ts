/**
 * poll-job.ts
 *
 * Replaces SSE streaming for all Lyzr agent calls.
 * Flow:
 *   1. POST to agent endpoint → { jobId }
 *   2. Poll GET /api/chat?jobId={jobId} every `intervalMs` until status = "complete" | "error"
 *   3. Resolve with result or reject with error string
 */

export interface JobResult<T = Record<string, unknown>> {
  status: "running" | "complete" | "error";
  result: T | null;
  error: string | null;
  created_at: string;
}

export async function pollJob<T = Record<string, unknown>>(
  jobId: string,
  options: {
    intervalMs?: number;
    timeoutMs?: number;
    onPoll?: (elapsedMs: number) => void;
  } = {}
): Promise<T> {
  const { intervalMs = 2000, timeoutMs = 120_000, onPoll } = options;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, intervalMs));

    const res = await fetch(`/api/chat?jobId=${encodeURIComponent(jobId)}`);
    if (!res.ok) throw new Error(`Poll failed with status ${res.status}`);

    const job: JobResult<T> = await res.json();

    if (job.status === "complete") {
      if (!job.result) throw new Error("Job completed but result is empty");
      return job.result;
    }

    if (job.status === "error") {
      throw new Error(job.error ?? "Agent job failed");
    }

    onPoll?.(Date.now() - (deadline - timeoutMs));
  }

  throw new Error("Agent timed out - please try again");
}

/** Handles sync `{ message }` or legacy async `{ jobId }` chat API responses. */
export async function resolveChatResponse<T extends { message: string }>(
  response: Response,
  options: {
    intervalMs?: number;
    timeoutMs?: number;
    onPoll?: (elapsedMs: number) => void;
  } = {}
): Promise<T> {
  const body = await response.json().catch(() => ({} as Record<string, unknown>));

  if (!response.ok) {
    const err =
      typeof body.error === "string"
        ? body.error
        : `API Error: ${response.status}`;
    throw new Error(err);
  }

  if (typeof body.jobId === "string" && body.jobId.length > 0) {
    return pollJob<T>(body.jobId, options);
  }

  if (typeof body.message === "string") {
    return body as T;
  }

  throw new Error("Invalid chat API response");
}

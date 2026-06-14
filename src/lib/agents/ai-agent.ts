/**
 * lib/agents/ai-agent.ts
 *
 * Frontend proxy for calling backend-hosted Lyzr agents.
 */

/** Agent calls can be slow (LLM round-trips), but must not hang forever. */
const AGENT_TIMEOUT_MS = 60_000;

export async function callAIAgent(message: string, agentId: string, params: any = {}) {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE}/market-setup/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: agentId,
        message: message,
        sessionId: params.session_id,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `Agent API error ${res.status}: ${errText}` };
    }

    const data = await res.json();
    
    // The use-chat.ts hook expects a specific response structure:
    // result.response.status === 'success'
    // result.response.result -> the structured data (parsedJson)
    // extractText(result.response) -> the display message
    return {
      success: true,
      response: {
        status: 'success',
        message: data.response,
        result: data.parsedJson
      }
    };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    return {
      success: false,
      error: isAbort
        ? `Agent service timed out after ${AGENT_TIMEOUT_MS / 1000}s`
        : error instanceof Error
          ? error.message
          : "Failed to connect to agent service",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function extractText(response: any): string {
  if (!response) return "";
  if (typeof response === "string") return response;
  return response.message || "";
}

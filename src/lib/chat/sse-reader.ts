export interface SSEEvent {
    type: "status" | "complete" | "error" | "thinking" | "output_generated" | "agent_event" | "content";
    step?: string;
    message?: string;
    proposals?: any[];
    metadata?: Record<string, any>;
    duration?: number;
    payload?: any;
}

export async function readSSEStream(
    response: Response,
    onStatus: (msg: string, step: string) => void,
    onComplete: (data: { message: string; proposals?: any[]; metadata?: any; [key: string]: any }) => void,
    onError: (msg: string) => void,
    onEvent?: (evt: SSEEvent) => void,
    onContent?: (chunk: string) => void
): Promise<void> {
    const reader = response.body?.getReader();
    if (!reader) {
        onError("No response stream");
        return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let rawAccumulator = ""; // Accumulates raw text chunks from Lyzr
    let completeFired = false;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr || jsonStr === "[DONE]") continue;

            let parsed = false;
            try {
                const evt: SSEEvent = JSON.parse(jsonStr);
                parsed = true;

                if (onEvent) onEvent(evt);

                switch (evt.type) {
                    case "status":
                    case "thinking":
                        onStatus(evt.message || "", evt.step || "");
                        break;

                    case "content":
                        // Structured content chunk from the backend SSE wrapper
                        rawAccumulator += evt.message || "";
                        if (onContent) onContent(rawAccumulator);
                        break;

                    case "complete":
                        if (!completeFired) {
                            completeFired = true;
                            onComplete({
                                message: evt.message || "",
                                proposals: evt.proposals,
                                metadata: evt.metadata,
                                ...evt // Pass through everything else like raw_json
                            });
                        }
                        break;

                    case "error":
                        onError(evt.message || "Unknown error");
                        break;

                    // output_generated, agent_event, etc. - already forwarded via onEvent above
                }
            } catch {
                // ── RAW TEXT CHUNK (Lyzr streams raw JSON fragments) ──────────
                // Lyzr's streaming endpoint sends character-by-character raw text
                // as `data: <fragment>` lines. JSON.parse fails on every partial
                // line. We accumulate all fragments and forward to onContent so
                // the UI shows live progress. When the stream ends we synthesise
                // a complete event from the accumulator if one was never sent.
                rawAccumulator += jsonStr;
                if (onContent) onContent(rawAccumulator);
            }
        }
    }

    // ── End-of-stream safety net ─────────────────────────────────────────────
    // If the backend never sent a structured {"type":"complete"} event (which
    // happens when Lyzr sends only raw text chunks), synthesise onComplete from
    // everything we accumulated so the reply is never silently dropped.
    if (!completeFired && rawAccumulator.trim()) {
        onComplete({ message: rawAccumulator.trim() });
    }
}

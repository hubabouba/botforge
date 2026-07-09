/**
 * Client-side reader for the assistant's NDJSON stream (`/api/ai/chat`).
 *
 * The server writes one JSON object per line; we read the response body with a
 * plain `fetch` reader (not `EventSource`, which can't POST) and yield each
 * parsed event. A network chunk can split a line, so we buffer the tail between
 * reads. Malformed lines are skipped rather than throwing.
 */
import type { AssistantStreamEvent } from "./types";

/** Stream events as seen by the client — the provider events plus a mid-stream error. */
export type ClientStreamEvent = AssistantStreamEvent | { type: "error"; message: string };

export async function* readAssistantStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ClientStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const parse = (line: string): ClientStreamEvent | null => {
    const trimmed = line.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as ClientStreamEvent;
    } catch {
      return null;
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const event = parse(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
        if (event) yield event;
      }
    }
    // Flush a final line that arrived without a trailing newline.
    const last = parse(buffer);
    if (last) yield last;
  } finally {
    reader.releaseLock();
  }
}

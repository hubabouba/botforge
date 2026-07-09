/**
 * Gemini provider for the workspace assistant (free tier).
 *
 * Calls Google's Generative Language REST API directly (no SDK dependency) with
 * a single `write_file` function declaration, mirroring the Claude provider so
 * the API route can swap between them by plan. Streams the same
 * `AssistantStreamEvent`s (text deltas + completed file edits).
 */
import { buildSystemPrompt, type AssistantParams, type AssistantStreamEvent } from "./types";

// gemini-2.5-flash has a real free-tier quota; gemini-2.0-flash is capped at 0
// free requests for many accounts/regions (returns 429 immediately).
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
}

interface GeminiChunk {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
}

/** Parse one `data: {...}` SSE line into assistant events (skips keep-alives/noise). */
function eventsFromLine(line: string): AssistantStreamEvent[] {
  if (!line.startsWith("data:")) return [];
  const json = line.slice(5).trim();
  if (!json || json === "[DONE]") return [];
  let chunk: GeminiChunk;
  try {
    chunk = JSON.parse(json) as GeminiChunk;
  } catch {
    return [];
  }
  const parts = chunk.candidates?.[0]?.content?.parts ?? [];
  const events: AssistantStreamEvent[] = [];
  for (const part of parts) {
    if (typeof part.text === "string" && part.text) events.push({ type: "text", delta: part.text });
    if (part.functionCall?.name === "write_file") {
      const args = part.functionCall.args ?? {};
      if (typeof args.path === "string" && typeof args.content === "string") {
        events.push({ type: "edit", path: args.path, content: args.content });
      }
    }
  }
  return events;
}

export async function* assistantChatGeminiStream(params: AssistantParams): AsyncGenerator<AssistantStreamEvent> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set.");

  const contents = params.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  // Free-tier limits: this is the deliberately-capped assistant. Keep it useful
  // for simple bots but nudge bigger work toward a paid plan (Claude).
  const freeTierNote = `

You are the free-tier assistant. Constraints for this tier:
- Change at most ONE file per reply. If the task needs several files, do the most important one and say the rest is available on a paid plan.
- Keep explanations to 1-2 short sentences.
- For advanced multi-file features, refactors, or debugging from logs, briefly note these work best on Basic/Pro.`;

  const body = {
    system_instruction: { parts: [{ text: buildSystemPrompt(params) + freeTierNote }] },
    generationConfig: { maxOutputTokens: 1200, temperature: 0.7 },
    contents,
    tools: [
      {
        function_declarations: [
          {
            name: "write_file",
            description:
              "Create a new file or overwrite an existing one with its full new content. Always provide the complete file, never a diff.",
            parameters: {
              type: "object",
              properties: {
                path: { type: "string", description: "POSIX path relative to the project root" },
                content: { type: "string", description: "The complete new content of the file" },
              },
              required: ["path", "content"],
            },
          },
        ],
      },
    ],
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 429) {
      throw new Error(
        "The free assistant hit its rate limit for the moment. Wait about a minute and try again.",
      );
    }
    throw new Error(`Gemini error ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.body) throw new Error("Gemini returned an empty response stream.");

  // SSE: one `data: {...}` object per line. A network chunk can split a line,
  // so buffer the tail between reads.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        for (const event of eventsFromLine(line)) yield event;
      }
    }
    for (const event of eventsFromLine(buffer)) yield event;
  } finally {
    // Runs on early generator return too (client disconnected mid-stream) —
    // cancel the upstream HTTP stream instead of letting it drain in the void.
    void reader.cancel().catch(() => {});
  }
}

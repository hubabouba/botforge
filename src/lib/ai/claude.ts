import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, type AssistantParams, type AssistantStreamEvent } from "./types";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set.");
  }
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

/** Model powering the in-workspace coding assistant (paid plans). */
const ASSISTANT_MODEL = "claude-sonnet-5";

const WRITE_FILE_TOOL = {
  name: "write_file",
  description:
    "Create a new file or overwrite an existing one with its full new content. Always provide the complete file, never a diff.",
  input_schema: {
    type: "object" as const,
    properties: {
      path: { type: "string", description: "POSIX path relative to the project root, e.g. bot/handlers.py" },
      content: { type: "string", description: "The complete new content of the file" },
    },
    required: ["path", "content"],
  },
};

/**
 * The workspace assistant (Claude): answers questions about the bot project and
 * proposes concrete file edits via the write_file tool. Streams prose as it's
 * generated, then emits each fully-assembled file edit once the tool call
 * completes. Runs a single turn — edits are proposals the client applies, since
 * files live in the browser.
 */
export async function* assistantChatStream(params: AssistantParams): AsyncGenerator<AssistantStreamEvent> {
  const anthropic = getClient();
  const system = buildSystemPrompt(params);

  // Prompt caching (~0.1x input price on cache hits). Two breakpoints:
  //  1. the system prompt (contains the whole file dump; also covers tools,
  //     which render before system) — reused across turns until files change;
  //  2. the last message — so next turn the entire prior conversation is a
  //     cache read instead of full-price input.
  const last = params.messages.length - 1;
  const stream = anthropic.messages.stream({
    model: ASSISTANT_MODEL,
    max_tokens: 4096,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    tools: [WRITE_FILE_TOOL],
    messages: params.messages.map((m, i) =>
      i === last
        ? {
            role: m.role,
            content: [{ type: "text" as const, text: m.content, cache_control: { type: "ephemeral" as const } }],
          }
        : { role: m.role, content: m.content },
    ),
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield { type: "text", delta: event.delta.text };
    }
  }

  // The SDK assembles partial tool-argument JSON for us — read the final message
  // to get complete write_file calls rather than reconstructing input_json_delta.
  const final = await stream.finalMessage();
  for (const block of final.content) {
    if (block.type === "tool_use" && block.name === "write_file") {
      const input = block.input as { path?: string; content?: string };
      if (input.path && typeof input.content === "string") {
        yield { type: "edit", path: input.path, content: input.content };
      }
    }
  }
}

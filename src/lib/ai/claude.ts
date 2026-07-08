import Anthropic from "@anthropic-ai/sdk";
import {
  buildSystemPrompt,
  defaultReply,
  type AssistantEdit,
  type AssistantParams,
  type AssistantResult,
} from "./types";

export type { AssistantEdit, AssistantResult } from "./types";

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
 * proposes concrete file edits via the write_file tool. Runs a single turn —
 * proposed edits are returned to the client to apply, since files live in the browser.
 */
export async function assistantChat(params: AssistantParams): Promise<AssistantResult> {
  const anthropic = getClient();
  const system = buildSystemPrompt(params);

  // Prompt caching (~0.1x input price on cache hits). Two breakpoints:
  //  1. the system prompt (contains the whole file dump; also covers tools,
  //     which render before system) — reused across turns until files change;
  //  2. the last message — so next turn the entire prior conversation is a
  //     cache read instead of full-price input.
  const last = params.messages.length - 1;
  const msg = await anthropic.messages.create({
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

  const reply = msg.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const edits: AssistantEdit[] = [];
  for (const block of msg.content) {
    if (block.type === "tool_use" && block.name === "write_file") {
      const input = block.input as { path?: string; content?: string };
      if (input.path && typeof input.content === "string") {
        edits.push({ path: input.path, content: input.content });
      }
    }
  }

  return { reply: reply || defaultReply(edits), edits };
}

import Anthropic from "@anthropic-ai/sdk";
import { botGraphSchema, type BotGraph } from "@/lib/schema/types";
import {
  buildSystemPrompt,
  defaultReply,
  type AssistantEdit,
  type AssistantParams,
  type AssistantResult,
} from "./types";

export type { AssistantEdit, AssistantResult } from "./types";

/** Model used to generate/edit bot graphs (good structured-output quality). */
const GEN_MODEL = "claude-sonnet-5";
/** Cheaper model used for the in-bot ai_reply node. */
const REPLY_MODEL = "claude-haiku-4-5-20251001";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set.");
  }
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const SYSTEM_GENERATE = `You design bot flows for a visual bot builder that runs on Telegram and Discord.
Given a plain-language description, output ONLY a JSON object matching this shape (no prose, no markdown fences):

{
  "nodes": [
    { "id": "n1", "type": "trigger", "trigger": "command", "value": "start" },
    { "id": "n2", "type": "message", "text": "Hello {user.name}!" },
    { "id": "n3", "type": "buttons", "text": "Pick one:", "buttons": [ { "label": "A", "next": "n4" } ] },
    { "id": "n4", "type": "condition", "source": "message", "operator": "contains", "value": "yes", "onTrue": "n5", "onFalse": "n6" },
    { "id": "n5", "type": "ai_reply", "systemPrompt": "You are a friendly support agent." },
    { "id": "n6", "type": "set_variable", "name": "score", "value": "1" }
  ],
  "edges": [ { "id": "e1", "source": "n1", "target": "n2" }, { "id": "e2", "source": "n2", "target": "n3" } ]
}

Rules:
- Node types allowed: trigger, message, buttons, condition, ai_reply, set_variable.
- Exactly one "trigger" node unless the user clearly needs several.
- Connect linear steps with "edges" (source -> target). For condition branches use onTrue/onFalse (node ids). For buttons, each button's "next" is a node id.
- Every referenced id must exist. Ids are short strings like "n1".
- Keep messages in the language of the user's description.
Return only the JSON object.`;

/** Generate a bot graph from a natural-language description. Retries once if the JSON is invalid. */
export async function generateGraph(description: string): Promise<BotGraph> {
  const anthropic = getClient();

  const ask = async (extra?: string): Promise<string> => {
    const msg = await anthropic.messages.create({
      model: GEN_MODEL,
      max_tokens: 4096,
      system: SYSTEM_GENERATE,
      messages: [{ role: "user", content: extra ? `${description}\n\n${extra}` : description }],
    });
    const block = msg.content.find((b) => b.type === "text");
    return block && block.type === "text" ? block.text : "";
  };

  const tryParse = (raw: string): BotGraph | null => {
    const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    try {
      const parsed = botGraphSchema.safeParse(JSON.parse(cleaned));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  };

  const first = tryParse(await ask());
  if (first) return first;

  const second = tryParse(await ask("Your previous output was not valid JSON for the schema. Return ONLY the JSON object."));
  if (second) return second;

  throw new Error("AI did not return a valid bot graph.");
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

/** Runtime helper for the ai_reply node: generate a single reply to the user. */
export async function generateReply(systemPrompt: string, userText: string): Promise<string> {
  const anthropic = getClient();
  const msg = await anthropic.messages.create({
    model: REPLY_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userText || "(empty message)" }],
  });
  const block = msg.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text : "";
}

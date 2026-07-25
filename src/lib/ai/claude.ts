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

/**
 * Agentic loop bounds. The assistant runs as a tool-using agent that can write
 * a file, read its own work back, review it, and improve it across several
 * turns within a single user request — real create-then-refine, not one shot.
 * Both bounds keep us comfortably inside the route's 60s maxDuration and cap the
 * paid-tier cost: MAX_TOOL_TURNS is the hard ceiling; SOFT_DEADLINE_MS makes us
 * stop starting new turns in time to always flush the edits we already have.
 */
const MAX_TOOL_TURNS = 4;
const SOFT_DEADLINE_MS = 45_000;

const WRITE_FILE_TOOL = {
  name: "write_file",
  description:
    "Create a new file or overwrite an existing one with its full new content. Always provide the complete file, never a diff. The write is saved immediately; you can read it back and keep improving it.",
  input_schema: {
    type: "object" as const,
    properties: {
      path: { type: "string", description: "POSIX path relative to the project root, e.g. bot/handlers.py" },
      content: { type: "string", description: "The complete new content of the file" },
    },
    required: ["path", "content"],
  },
};

const READ_FILE_TOOL = {
  name: "read_file",
  description:
    "Read the FULL, current content of a project file — including edits you've made this turn. The file listing in the system prompt truncates long files, so read a file this way before rewriting it if it might be longer than what you can see, so you never drop code you didn't read.",
  input_schema: {
    type: "object" as const,
    properties: {
      path: { type: "string", description: "POSIX path of the file to read, e.g. bot/handlers.py" },
    },
    required: ["path"],
  },
};

// Claude-only agent guidance, appended after the shared prompt (like gemini.ts
// appends its free-tier note) so the free provider's prompt stays untouched.
const AGENT_NOTE = `

You are running as a coding agent with tools, in a loop — not a single reply:
- Plan the change, then use write_file with the COMPLETE new content of each file you create or change.
- Don't stop at a first draft. After writing, read your own files back with read_file, check them against the request (correctness, missing edge cases, wrong types, a forgotten await, secrets left in code), and rewrite anything weak. Prefer one more review pass over shipping something rough.
- Split non-trivial work into focused, well-named files like a senior engineer, but never fragment a small change into needless files.
- When the work is genuinely done and reviewed, stop calling tools and end with a short plain-language summary of what you changed and why.`;

/**
 * The workspace assistant (Claude): an agent that answers questions about the
 * bot project and makes concrete file edits via tools. It streams prose as it's
 * generated and runs a bounded write→read→review→refine loop so edits are
 * actually created and improved server-side before they reach the client, which
 * applies the final version of each touched file once the loop ends. Extended
 * thinking is on, so the model plans and self-reviews internally; that reasoning
 * never reaches the client (the loop only forwards `text_delta`).
 */
export async function* assistantChatStream(params: AssistantParams): AsyncGenerator<AssistantStreamEvent> {
  const anthropic = getClient();
  const planning = params.intent === "plan";
  const system = buildSystemPrompt(params) + (planning ? "" : AGENT_NOTE);

  // A server-side working copy of the project, seeded with the FULL (untruncated)
  // files the request carried. read_file serves from here — including the model's
  // own in-loop writes — so review passes see current content, not stale text.
  const working = new Map<string, string>();
  for (const f of params.files) working.set(f.path, f.content);

  // Final edits to hand back — last write per path wins, emitted only after the
  // loop ends so the client applies each file once, in its finished form (never
  // an intermediate draft from a mid-loop write).
  const edits = new Map<string, string>();

  // Prompt caching (~0.1x input on cache hits). Two breakpoints, both on the
  // initial request: the system prompt (holds the whole file dump; tools render
  // before it too) and the last user message. As the transcript grows with tool
  // turns, everything up to that breakpoint stays a cache read each turn.
  const last = params.messages.length - 1;
  const messages: Anthropic.MessageParam[] = params.messages.map((m, i) =>
    i === last
      ? {
          role: m.role,
          content: [{ type: "text" as const, text: m.content, cache_control: { type: "ephemeral" as const } }],
        }
      : { role: m.role, content: m.content },
  );

  // Planning mode returns a diagram + plan and must never touch files, so it
  // runs tool-less (which also makes the loop naturally end after one turn).
  const tools = planning ? undefined : [WRITE_FILE_TOOL, READ_FILE_TOOL];
  const deadline = Date.now() + SOFT_DEADLINE_MS;

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const stream = anthropic.messages.stream({
      model: ASSISTANT_MODEL,
      // max_tokens must comfortably exceed the thinking budget (Anthropic
      // requires it); thinking tokens bill as output — a deliberate quality/cost
      // trade only paid users hit. Temperature stays unset (thinking needs the
      // API default).
      max_tokens: 8000,
      thinking: { type: "enabled", budget_tokens: 2048 },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      ...(tools ? { tools } : {}),
      messages,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { type: "text", delta: event.delta.text };
      }
    }

    // The SDK assembles partial tool-argument JSON for us — read the final
    // message to get complete tool calls (and the thinking blocks, which must be
    // sent back verbatim when continuing an extended-thinking + tool-use turn).
    const final = await stream.finalMessage();
    const toolUses = final.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) break; // model is done — no more tool calls

    // Answer each tool call, updating the working copy + the final edit set.
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUses) {
      if (block.name === "write_file") {
        const input = block.input as { path?: string; content?: string };
        if (input.path && typeof input.content === "string") {
          working.set(input.path, input.content);
          edits.set(input.path, input.content);
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Saved ${input.path} (${input.content.length} chars). Read it back to review, or keep going.`,
          });
        } else {
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: "write_file needs both a path and full content.",
            is_error: true,
          });
        }
      } else if (block.name === "read_file") {
        const input = block.input as { path?: string };
        const content = input.path ? working.get(input.path) : undefined;
        if (content !== undefined) {
          results.push({ type: "tool_result", tool_use_id: block.id, content: content || "(this file is empty)" });
        } else {
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `No file at "${input.path ?? ""}". Files in this project: ${[...working.keys()].join(", ")}`,
            is_error: true,
          });
        }
      }
    }

    // Extend the transcript with this turn and its tool results, then loop so the
    // model sees the outcome and can review/improve or finish.
    messages.push({ role: "assistant", content: final.content as Anthropic.ContentBlockParam[] });
    messages.push({ role: "user", content: results });

    // Stop opening new turns in time to flush what we already built before the
    // route's hard 60s cutoff.
    if (Date.now() > deadline) break;
  }

  for (const [path, content] of edits) {
    yield { type: "edit", path, content };
  }
}

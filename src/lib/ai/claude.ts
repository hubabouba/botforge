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

/** Default model for the in-workspace coding assistant; Max overrides to Opus. */
const ASSISTANT_MODEL = "claude-sonnet-5";

/**
 * Agentic loop bounds. The assistant runs as a tool-using agent that can write
 * a file, read its own work back, review it, and improve it across several
 * turns within a single user request — real create-then-refine, not one shot.
 * MAX_TOOL_TURNS caps paid-tier cost; the time budget (params.budgetMs, from
 * the route's maxDuration) caps wall-clock. A single big turn can outlast any
 * "don't start new turns" check — a live launch-day 504 proved it — so the
 * budget is enforced with a real stream.abort() on the in-flight call, leaving
 * WRAP_UP_MS to flush the edits that already finished instead of dying with
 * nothing when the platform kills the function.
 */
const MAX_TOOL_TURNS = 4;
const DEFAULT_BUDGET_MS = 50_000;
const WRAP_UP_MS = 10_000;

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

const OPEN_PLAN_TOOL = {
  name: "open_plan",
  description:
    "Use when the user is asking for a plan, roadmap, or architecture for the bot rather than an immediate code change (\"plan out X\", \"how should I structure this\", \"what are the steps\"). Hands the request to the Planning tab, which builds a diagram and a step-by-step plan the user can then work through. Don't use it for ordinary build requests — those you do yourself with write_file.",
  input_schema: {
    type: "object" as const,
    properties: {
      goal: {
        type: "string",
        description: "What the plan should cover, in one sentence, from the user's request.",
      },
    },
    required: ["goal"],
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
 * Extra nudge for the no-thinking tier. With extended thinking off, the model
 * reaches for tools noticeably less — and this whole feature is tool calls, so
 * without this it answers *about* the code instead of writing it.
 */
const NO_THINKING_NOTE = `

You are running without a separate reasoning pass, so be deliberate about acting: when the user asks for a change, call write_file — describing the change in prose instead of writing the file is not completing the task. A brief sentence before a tool call is fine.`;

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
  // Both planning modes are read-only: no tools, no agent note telling the model
  // to write files. "review" additionally reads the plan it's judging.
  const planning = params.intent === "plan" || params.intent === "review";
  const model = params.model || ASSISTANT_MODEL;
  // Default matches the paid tiers; the route always passes an explicit config.
  const reasoning = params.reasoning ?? { thinking: true, effort: "high" as const };
  const system =
    buildSystemPrompt(params) +
    (planning ? "" : AGENT_NOTE) +
    (!planning && !reasoning.thinking ? NO_THINKING_NOTE : "");

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
  const tools = planning ? undefined : [WRITE_FILE_TOOL, READ_FILE_TOOL, OPEN_PLAN_TOOL];
  const deadline = Date.now() + (params.budgetMs ?? DEFAULT_BUDGET_MS);
  let outOfTime = false;
  let truncated = false;
  let saidSomething = false;

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const stream = anthropic.messages.stream({
      model,
      // Reasoning is set EXPLICITLY on every request. Two defaults would bite us
      // otherwise: omitting `thinking` runs adaptive (it is not off), and
      // omitting `effort` runs "high" — so an unset pair silently opts every
      // tier into the expensive end. `budget_tokens` is gone: it's a 400 on
      // Sonnet 5 / Opus 5, and `effort` replaces it.
      //
      // `display: "summarized"` is what makes reasoning visible to the user —
      // the default is "omitted", which streams thinking blocks with empty text.
      // Thinking tokens bill as output, which is exactly why Basic runs without
      // them (see reasoningFor in plan.ts).
      thinking: reasoning.thinking ? { type: "adaptive", display: "summarized" } : { type: "disabled" },
      output_config: { effort: reasoning.effort },
      // max_tokens caps thinking AND output together — it is a ceiling, not a
      // spend target (effort controls actual usage). 16000 was too tight the
      // moment effort went to xhigh: the model spent the whole allowance
      // reasoning and got truncated before writing a word, which reached users
      // as "the assistant returned an empty reply". 64K is the documented
      // starting point for high/xhigh, and leaves room for a full file write
      // after a long think.
      max_tokens: 64000,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      ...(tools ? { tools } : {}),
      messages,
    });

    // Abort the in-flight call shortly before the budget ends — a long single
    // turn is the one thing the between-turns check below cannot bound.
    const killer = setTimeout(() => stream.abort(), Math.max(deadline - WRAP_UP_MS - Date.now(), 1_000));
    try {
      for await (const event of stream) {
        if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            saidSomething = true;
            yield { type: "text", delta: event.delta.text };
          } else if (event.delta.type === "thinking_delta") {
            yield { type: "thinking", delta: event.delta.thinking };
          }
        }
      }
    } catch (e) {
      const aborted = e instanceof Anthropic.APIUserAbortError || (e as Error)?.name === "APIUserAbortError";
      if (!aborted) throw e; // real API errors still surface to the route's catch
      outOfTime = true;
    } finally {
      clearTimeout(killer);
    }
    if (outOfTime) break; // finalMessage() would reject after an abort

    // The SDK assembles partial tool-argument JSON for us — read the final
    // message to get complete tool calls (and the thinking blocks, which must be
    // sent back verbatim when continuing an extended-thinking + tool-use turn).
    const final = await stream.finalMessage();
    // Hit the output ceiling. Worth saying out loud: the turn is cut off, so
    // anything the model was midway through writing is simply gone.
    if (final.stop_reason === "max_tokens") truncated = true;
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
      } else if (block.name === "open_plan") {
        const input = block.input as { goal?: string };
        const goal = (input.goal ?? "").trim();
        if (goal) {
          // Surfaced immediately (not held back like edits): the client switches
          // tabs and starts building the plan while this turn is still finishing.
          yield { type: "plan", goal };
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            content:
              "Opened the Planning tab and started building the plan there. Tell the user in one sentence that the plan is being built in the Planning tab — do not write the plan out yourself.",
          });
        } else {
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: "open_plan needs a one-sentence goal.",
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

    // Don't open another turn without enough time left to do anything with it.
    if (Date.now() > deadline - WRAP_UP_MS) break;
  }

  // Say what happened instead of going quiet. Every one of these used to reach
  // the user as a bare "the assistant returned an empty reply".
  if (outOfTime) {
    yield {
      type: "text",
      delta:
        edits.size > 0
          ? "\n\n⏱ I ran out of time mid-build, so I stopped here — every file below is complete and applied. Send a follow-up message and I'll continue where I left off."
          : "\n\n⏱ This request was too big to finish in one pass and I ran out of time. Try splitting it up — start with the core bot in one message, then add features one at a time.",
    };
  } else if (truncated && !saidSomething) {
    yield {
      type: "text",
      delta:
        "This one hit my output limit while I was still working it out, so nothing came back. Ask for it in smaller pieces — one feature at a time — and it'll go through.",
    };
  } else if (!saidSomething && edits.size === 0) {
    yield {
      type: "text",
      delta: "I didn't produce anything for that one. Try rephrasing it, or say specifically which file you want changed.",
    };
  }

  for (const [path, content] of edits) {
    yield { type: "edit", path, content };
  }
}

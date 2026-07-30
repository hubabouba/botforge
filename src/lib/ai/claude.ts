import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, type AssistantParams, type AssistantStreamEvent } from "./types";
import { applyStringEdit, editFailureMessage } from "./editFile";

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

/**
 * Change part of a file instead of rewriting it.
 *
 * This exists for one reason and it's money. write_file bills the entire file
 * as output tokens, at 5x the input rate — measured on real traffic, output is
 * 49% of what a message costs. Fixing one line in a 150-line file used to emit
 * all 150. Now it emits the line.
 */
const EDIT_FILE_TOOL = {
  name: "edit_file",
  description:
    "Change part of an existing file. Prefer this over write_file for any change to a file that already exists — fixing a bug, adding a handler, renaming something — because it is far cheaper and safer than re-emitting the whole file. old_string must match the file EXACTLY, byte for byte, including indentation, and must appear exactly once: include a line or two of surrounding context to make it unique. Set new_string to \"\" to delete the matched text. Call it once per distinct change; several calls on the same file in one turn are applied in order.",
  input_schema: {
    type: "object" as const,
    properties: {
      path: { type: "string", description: "POSIX path of the file to change, e.g. bot/handlers.py" },
      old_string: {
        type: "string",
        description: "The exact text to replace, copied verbatim from the file, unique within it.",
      },
      new_string: { type: "string", description: 'What to put in its place. Empty string deletes the text.' },
    },
    required: ["path", "old_string", "new_string"],
  },
};

const WRITE_FILE_TOOL = {
  name: "write_file",
  description:
    "Create a NEW file, or replace an existing one wholesale when the change is so extensive that a targeted edit makes no sense. Provide the complete file content, never a diff. For changing part of a file that already exists, use edit_file instead — it costs a fraction of this. The write is saved immediately; you can read it back and keep improving it.",
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

const FINISH_STEP_TOOL = {
  name: "finish_step",
  description:
    'Report the outcome of the build-plan step you were handed, once, at the end of your turn. Use "done" only when the code for this step is written, reviewed and complete — it ticks the step off in the user\'s plan and starts the next one, so never claim work you did not do. Use "blocked" when you cannot finish it without something only the user can give you (a decision between two real options, a credential, a business rule); that stops the run so they can answer.',
  input_schema: {
    type: "object" as const,
    properties: {
      status: {
        type: "string",
        enum: ["done", "blocked"],
        description: 'Whether this step is now complete ("done") or you could not finish it ("blocked").',
      },
      note: {
        type: "string",
        description: "One sentence: what you built, or what you need in order to continue.",
      },
    },
    required: ["status"],
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
- Plan the change, then make it. Use edit_file to change a file that already exists — one call per distinct change, with enough surrounding context that old_string is unique. Use write_file only for a NEW file, or when you are genuinely rewriting almost all of an existing one.
- Fixing a reported bug is nearly always one or two small edit_file calls. Re-emitting a whole file to change a few lines wastes the user's quota and risks dropping code you didn't mean to touch.
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
 * Auto-run mode: the workspace is walking the user's build plan step by step and
 * this turn is one step. The checklist they watch is ticked from finish_step, so
 * the turn has to end with an honest verdict rather than trailing off.
 */
const STEP_NOTE = `

You have been handed ONE step of the user's build plan, and the workspace runs the steps in order — later steps are not your turn, so do only this one. Build it properly (write the files, read them back, fix what's weak), then end the turn by calling finish_step: "done" when the step is genuinely complete, "blocked" when you need something only the user can give you. Keep the closing summary to a sentence or two — they are watching several steps go by, not reading an essay each time.`;

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
  const stepMode = !planning && !!params.stepMode;
  const system =
    buildSystemPrompt(params) +
    (planning ? "" : AGENT_NOTE) +
    (!planning && !reasoning.thinking ? NO_THINKING_NOTE : "") +
    (stepMode ? STEP_NOTE : "");

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
  // finish_step only exists while a plan run is in progress: an unused tool is
  // schema the model re-reads (and pays for) on every ordinary message. In step
  // mode open_plan is dropped instead — the plan is already open and being run.
  const tools = planning
    ? undefined
    : stepMode
      ? [EDIT_FILE_TOOL, WRITE_FILE_TOOL, READ_FILE_TOOL, FINISH_STEP_TOOL]
      : [EDIT_FILE_TOOL, WRITE_FILE_TOOL, READ_FILE_TOOL, OPEN_PLAN_TOOL];
  const deadline = Date.now() + (params.budgetMs ?? DEFAULT_BUDGET_MS);
  let outOfTime = false;
  let truncated = false;
  let saidSomething = false;
  // The model's verdict on this plan step, once it gives one (step mode only).
  let stepVerdict: { status: "done" | "blocked"; note: string } | null = null;
  // Real token spend, summed across the loop's turns. Logged at the end so the
  // per-message cost is a measured number in the runtime logs rather than an
  // estimate — plan limits should be set from this, not from arithmetic.
  const spend = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, turns: 0 };

  const maxTurns = Math.min(params.maxTurns ?? MAX_TOOL_TURNS, MAX_TOOL_TURNS);
  for (let turn = 0; turn < maxTurns; turn++) {
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
    spend.input += final.usage.input_tokens ?? 0;
    spend.output += final.usage.output_tokens ?? 0;
    spend.cacheWrite += final.usage.cache_creation_input_tokens ?? 0;
    spend.cacheRead += final.usage.cache_read_input_tokens ?? 0;
    spend.turns += 1;
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
      } else if (block.name === "edit_file") {
        const input = block.input as { path?: string; old_string?: string; new_string?: string };
        const path = input.path ?? "";
        const current = working.get(path);
        if (current === undefined) {
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `No file at "${path}". Use write_file to create it. Files in this project: ${[...working.keys()].join(", ")}`,
            is_error: true,
          });
        } else {
          // Against the WORKING copy, so several edits to one file in a turn
          // compose — the second sees the result of the first, not the original.
          const result = applyStringEdit(current, input.old_string ?? "", input.new_string ?? "");
          if (result.ok) {
            working.set(path, result.content);
            // The edit set still carries whole files: the stream protocol, the
            // Apply button and the save path all speak full content, and none
            // of them needed to change for this. Only the model's side got
            // cheaper.
            edits.set(path, result.content);
            results.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: `Edited ${path}. Read it back if you want to check the result, or keep going.`,
            });
          } else {
            results.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: editFailureMessage(path, result),
              is_error: true,
            });
          }
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
      } else if (block.name === "finish_step") {
        const input = block.input as { status?: string; note?: string };
        const status = input.status === "blocked" ? "blocked" : "done";
        stepVerdict = { status, note: (input.note ?? "").trim() };
        // Surfaced immediately, like open_plan: the checklist ticks over while
        // this turn is still wrapping up.
        yield { type: "step", status, note: stepVerdict.note || undefined };
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: "Recorded. Nothing else to do on this step.",
        });
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

    // The model has declared the step finished — another turn would only buy a
    // restatement of what it just said, at full price, for every step of a run.
    if (stepVerdict) break;

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
  } else if (!saidSomething && stepVerdict?.note) {
    // Ending the loop on finish_step can leave the turn with no prose at all —
    // the note the model attached is exactly the sentence that belongs here.
    yield { type: "text", delta: stepVerdict.note };
  } else if (!saidSomething && edits.size === 0) {
    yield {
      type: "text",
      delta: "I didn't produce anything for that one. Try rephrasing it, or say specifically which file you want changed.",
    };
  }

  for (const [path, content] of edits) {
    yield { type: "edit", path, content };
  }

  logSpend(model, reasoning, spend, edits.size);
  // Hand the same numbers to whoever wants to keep them. The log line above
  // stays — it's still the fastest way to watch a single request live — but it
  // is not retrievable after the fact, which is why this exists.
  //
  // Awaited: this runs after the final yield, so it only executes at all
  // because the consumer pulls the generator one last time — and it must
  // finish before that pull resolves, or the response closes and the host
  // kills the invocation mid-write. See the note on `onSpend` in types.ts.
  await params.onSpend?.({
    model,
    inputTokens: spend.input,
    outputTokens: spend.output,
    cacheWriteTokens: spend.cacheWrite,
    cacheReadTokens: spend.cacheRead,
    usd: usdFor(model, spend),
  });
}

/** Cost of a finished request in USD, at the rates below. */
function usdFor(
  model: string,
  s: { input: number; output: number; cacheWrite: number; cacheRead: number },
): number {
  const rate = RATES[model] ?? RATES["claude-sonnet-5"];
  return (
    (s.input * rate.in + s.cacheWrite * rate.in * 1.25 + s.cacheRead * rate.in * 0.1 + s.output * rate.out) /
    1_000_000
  );
}

/**
 * Per-million-token rates, for turning the usage numbers into a figure that
 * means something at a glance. Cache writes bill at 1.25x input, reads at 0.1x.
 * Rough by design — it exists to rank messages by cost, not to bill anyone.
 */
const RATES: Record<string, { in: number; out: number }> = {
  "claude-opus-5": { in: 5, out: 25 },
  "claude-sonnet-5": { in: 3, out: 15 },
};

function logSpend(
  model: string,
  reasoning: { thinking: boolean; effort: string },
  s: { input: number; output: number; cacheWrite: number; cacheRead: number; turns: number },
  edits: number,
): void {
  const usd = usdFor(model, s);
  console.log(
    `[ai/spend] ${JSON.stringify({
      model,
      thinking: reasoning.thinking,
      effort: reasoning.effort,
      turns: s.turns,
      edits,
      in: s.input,
      cacheWrite: s.cacheWrite,
      cacheRead: s.cacheRead,
      out: s.output,
      usd: Number(usd.toFixed(4)),
    })}`,
  );
}

/**
 * Shared shapes for the in-workspace coding assistant, provider-agnostic.
 *
 * Both providers (Claude for paid plans, Gemini for the free tier) implement
 * `AssistantParams -> AssistantResult`, so the API route can swap between them
 * based on the user's plan without the client knowing which one ran.
 */

export interface AssistantEdit {
  /** POSIX path relative to the project root. */
  path: string;
  /** Full new file content (never a diff). */
  content: string;
}

export interface AssistantResult {
  reply: string;
  edits: AssistantEdit[];
}

/**
 * One event in a streamed assistant response, emitted by both providers so the
 * API route and client don't need to know which model produced it:
 *  - `text`: an incremental chunk of prose to append as it arrives.
 *  - `thinking`: an incremental chunk of the model's reasoning summary, shown
 *    in a collapsed block. Only tiers with extended thinking emit these.
 *  - `edit`: a complete proposed file write (Claude/Gemini stream text as it
 *    goes but only surface a tool call once its arguments are fully assembled).
 */
export type AssistantStreamEvent =
  | { type: "text"; delta: string }
  | { type: "thinking"; delta: string }
  | { type: "edit"; path: string; content: string }
  /** The user asked for a plan — the client opens Planning and builds it there. */
  | { type: "plan"; goal: string }
  /**
   * Verdict on the build-plan step this request was handed: the model saying
   * whether it finished. The client ticks the step off (or stops the run) from
   * this, so it must come from the model, not from guessing at its prose.
   */
  | { type: "step"; status: "done" | "blocked"; note?: string };

/** User-tunable persona for the assistant (how it talks, not what it can do). */
export interface AssistantPreferences {
  /** Preferred reply language, e.g. "Russian", "English". Empty = match the user. */
  language?: string;
  /** How much prose to write around the code. */
  style?: "concise" | "balanced" | "detailed";
  /** Free-form persona/character, e.g. "a strict senior engineer" or "friendly mentor". */
  persona?: string;
  /** Any extra free-form instructions the user wants respected. */
  custom?: string;
}

export const DEFAULT_PREFERENCES: AssistantPreferences = {
  language: "",
  style: "balanced",
  persona: "",
  custom: "",
};

export interface AssistantParams {
  /** `entry` is optional and only used to prioritise the file context. */
  project: { name: string; platform: string; language: string; entry?: string };
  files: { path: string; content: string }[];
  messages: { role: "user" | "assistant"; content: string }[];
  preferences?: AssistantPreferences;
  /**
   * "chat" edits files; "plan" returns a build plan and never edits; "review"
   * checks the plan against the code that exists and lists what's still missing.
   * Neither planning mode touches files.
   */
  intent?: "chat" | "plan" | "review";
  /**
   * The build plan the user generated in the Planning panel, if any. Without
   * this the assistant had no idea a plan existed — the user would approve one
   * in a panel the model never saw, then ask it to "build the plan".
   */
  plan?: string;
  /**
   * Live state of the user's hosted bot (status, and its console output when it
   * has crashed or they asked for it). Built server-side — see
   * `lib/ai/runtimeContext.ts` — never accepted from the client.
   */
  runtime?: string;
  /** Claude model id to run (tier-derived; Max → Opus). Ignored by Gemini. */
  model?: string;
  /**
   * Whether extended thinking runs, and how deep. Resolved from plan + tier by
   * `reasoningFor` — never from the client. Ignored by Gemini.
   */
  reasoning?: { thinking: boolean; effort: "low" | "medium" | "high" | "xhigh" };
  /** Cap on agentic loop turns (plan-derived). Ignored by Gemini. */
  maxTurns?: number;
  /**
   * Let the assistant stop and ask when the request is genuinely
   * underspecified, instead of guessing. Gated on `assistant.clarify` (Pro+).
   */
  clarify?: boolean;
  /**
   * Total wall-clock budget for the whole agentic loop, in ms. The route derives
   * it from its own maxDuration so the loop always finishes (and flushes the
   * edits it already built) before the platform would kill the function.
   */
  budgetMs?: number;
  /**
   * This message is one step of the user's build plan, run automatically. Adds
   * the finish_step tool so the assistant reports the outcome itself instead of
   * the client inferring it from whether files happened to change.
   */
  stepMode?: boolean;
  /**
   * Called once when the request finishes, with what it actually cost.
   *
   * The provider computes this because only it sees the token counts; the route
   * decides what to do with it because only it has a database client.
   *
   * Awaited, and it has to be. This used to be fire-and-forget on the theory
   * that bookkeeping must never disturb a reply the user is reading — true, but
   * it left the write racing the platform. The call lands after the last event
   * has been streamed, so on a serverless host the function is torn down the
   * moment the response closes, and an un-awaited round trip to Postgres loses
   * that race every time: 29 paid requests, zero rows in `ai_spend`. Awaiting
   * here holds the invocation open for one insert. The reply is already fully
   * delivered by then, so nothing the user sees waits on it.
   */
  onSpend?: (spend: AssistantSpend) => void | Promise<void>;
}

/** What one assistant request cost, measured rather than estimated. */
export interface AssistantSpend {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  /** USD at the rates in claude.ts, computed at call time. */
  usd: number;
}

/** Turns the user's persona settings into extra system-prompt lines. */
function preferenceLines(prefs?: AssistantPreferences): string {
  if (!prefs) return "";
  const lines: string[] = [];
  if (prefs.language && prefs.language.trim()) {
    lines.push(`- Always reply in ${prefs.language.trim()}. Keep code, file paths and identifiers unchanged.`);
  }
  if (prefs.style === "concise") {
    lines.push("- Be terse: a sentence or two at most around any code. No preamble.");
  } else if (prefs.style === "detailed") {
    lines.push("- Explain your reasoning and trade-offs, and include a short usage example when relevant.");
  }
  if (prefs.persona && prefs.persona.trim()) {
    lines.push(`- Adopt this persona in tone and word choice: ${prefs.persona.trim()}. Never let it compromise correctness or safety.`);
  }
  if (prefs.custom && prefs.custom.trim()) {
    lines.push(`- Also follow the user's instruction: ${prefs.custom.trim()}`);
  }
  if (!lines.length) return "";
  return `\n\nHow to respond (user preferences — obey unless they conflict with the rules above):\n${lines.join("\n")}`;
}

/**
 * Total characters of file *content* the prompt may carry (~6k tokens). Every
 * message re-sends this, and edits invalidate the cache, so an unbounded dump
 * of the whole project is the single largest recurring cost in the product.
 * Files past the budget are still listed by path — the assistant pulls them
 * with read_file only if it actually needs them.
 */
const FILE_CONTEXT_BUDGET = 24_000;
const PER_FILE_CAP = 6_000;

function buildFileContext(params: AssistantParams): string {
  const { files } = params;
  if (!files.length) return "(no files yet)";

  // The entry file first — it's the one a question is most often about — then
  // the rest in project order until the budget runs out.
  const entry = params.project.entry;
  const ordered = entry ? [...files].sort((a, b) => Number(b.path === entry) - Number(a.path === entry)) : files;

  const included: string[] = [];
  const omitted: string[] = [];
  let spent = 0;

  for (const f of ordered) {
    const body = f.content.slice(0, PER_FILE_CAP);
    if (spent + body.length > FILE_CONTEXT_BUDGET && included.length > 0) {
      omitted.push(f.path);
      continue;
    }
    spent += body.length;
    const truncated = f.content.length > body.length ? "\n… (truncated — read_file for the rest)" : "";
    included.push(`--- ${f.path} ---\n${body}${truncated}`);
  }

  const listing = `All files in this project: ${files.map((f) => f.path).join(", ")}`;
  const note = omitted.length
    ? `\n\nNot shown above (use read_file if you need them): ${omitted.join(", ")}`
    : "";
  return `${listing}\n\n${included.join("\n\n")}${note}`;
}

/** System prompt shared by every provider so behavior is consistent. */
export function buildSystemPrompt(params: AssistantParams): string {
  const fileDump = buildFileContext(params);

  const reviewing =
    params.intent === "review"
      ? `

REVIEW MODE: Do NOT modify files and do NOT call write_file. Compare the build plan above against the project's files as they are right now, then reply with ONLY a numbered list of what is still missing or done badly — no preamble, no diagram, no summary of what's already fine.

Each line: what's missing and which file it belongs in, specific enough to act on. Judge the code that exists, not the plan's wording: a step whose code is present and correct doesn't belong in the list. If everything in the plan is genuinely done, reply with the single line "1. Nothing left — the plan is fully implemented."`
      : "";

  const planning =
    params.intent === "plan"
      ? `

PLANNING MODE: Do NOT modify files or call write_file. Reply with TWO parts, in this order:

1) An architecture diagram of how the bot works, as a Mermaid \`flowchart TD\` inside a fenced code block that starts with \`\`\`mermaid and ends with \`\`\`. Keep it to about 5–9 nodes (e.g. the platform/user → the bot entrypoint → command/event handlers → any external APIs or storage). Use short ASCII node ids (A, B, cmd, api…) and short labels. IMPORTANT for the renderer: put every label in square brackets like A[Start], keep labels plain (letters, digits, spaces only — no parentheses, quotes, slashes, colons or punctuation inside labels), and use only simple \`-->\` or \`-->|label|\` edges.

2) After the diagram, a concise, practical numbered build plan. For each step name the feature, what to do, and which file(s) to create or change. Keep it specific and buildable — no fluff.`
      : "";

  // The plan is context in chat mode and the subject in review mode. It is
  // deliberately absent while *generating* a plan: priming the model with the
  // previous one makes it rewrite instead of planning afresh.
  const planText = params.plan?.trim().slice(0, 8000) ?? "";
  let planContext = "";
  if (planText && params.intent === "review") {
    planContext = `

--- BUILD PLAN UNDER REVIEW ---
${planText}
--- END BUILD PLAN ---`;
  } else if (planText && params.intent !== "plan") {
    planContext = `

The user has already worked out a build plan for this project in the Planning panel. Follow it when they refer to "the plan", and keep your changes consistent with it. If they ask for something that contradicts it, do what they ask and say briefly how it differs.

--- BUILD PLAN ---
${planText}
--- END BUILD PLAN ---`;
  }

  // Deliberately narrow: the bar is "different readings produce materially
  // different work", not "anything is unclear". An assistant that checks in on
  // every judgment call is worse than one that picks a sane default and says so.
  const clarifying = params.clarify
    ? `

Asking instead of guessing:
- When the request is genuinely underspecified — two reasonable readings would lead to materially different code, or you'd need a credential, API or business rule you have no way to know — stop and ask. Ask the one or two questions that actually unblock you, and don't write files on that turn.
- Routine judgment calls (naming, file layout, which of two equivalent approaches) are yours to make: pick a sensible one and mention it in a sentence. Don't ask about those.
- If part of the task is clear and part isn't, build the clear part, then ask about the rest.`
    : "";

  return `You are Botforge's coding assistant. You help the user build a ${params.project.platform} bot written in ${params.project.language}. The project is called "${params.project.name}".

Rules:
- Keep the project runnable and idiomatic; match the existing structure and style.
- Before writing any code, think through which files to touch or create, what could go wrong, and a short plan of the change — then act on it. Do not print this plan; just follow it.
- When you add or change code, make the change with the file tools rather than printing code in the reply. Which tool, and what it expects, is described on the tools themselves — they differ between tiers, so follow the descriptions you were given rather than assuming.
- Organize code like a senior engineer: for anything beyond a trivial edit, split logic into focused, well-named files (e.g. handlers, utils, config) instead of piling everything into one growing file — but never fragment a small change into needless files.
- Make focused, minimal changes and briefly explain what you did in plain language.
- Before finishing, quickly re-check your own changes for common bugs: unhandled errors, wrong types, a missing await, off-by-one mistakes, or secrets left in code.
- Never hardcode secrets or tokens — read them from environment variables.
- If the request is just a question, answer it without editing files.${planning}${clarifying}${preferenceLines(params.preferences)}${planContext}${reviewing}${params.runtime ?? ""}

Current project files:
${fileDump}`;
}

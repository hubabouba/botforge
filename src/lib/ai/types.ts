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
  | { type: "plan"; goal: string };

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
  project: { name: string; platform: string; language: string };
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

/** System prompt shared by every provider so behavior is consistent. */
export function buildSystemPrompt(params: AssistantParams): string {
  const fileDump = params.files
    .map((f) => `--- ${f.path} ---\n${f.content.slice(0, 8000)}`)
    .join("\n\n");

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
- When you add or change code, call the write_file tool with the COMPLETE new file content (never a diff or a fragment).
- Organize code like a senior engineer: for anything beyond a trivial edit, split logic into focused, well-named files (e.g. handlers, utils, config) instead of piling everything into one growing file — but never fragment a small change into needless files.
- Make focused, minimal changes and briefly explain what you did in plain language.
- Before finishing, quickly re-check your own changes for common bugs: unhandled errors, wrong types, a missing await, off-by-one mistakes, or secrets left in code.
- Never hardcode secrets or tokens — read them from environment variables.
- If the request is just a question, answer it without editing files.${planning}${clarifying}${preferenceLines(params.preferences)}${planContext}${reviewing}${params.runtime ?? ""}

Current project files:
${fileDump}`;
}

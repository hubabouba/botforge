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
 *  - `edit`: a complete proposed file write (Claude/Gemini stream text as it
 *    goes but only surface a tool call once its arguments are fully assembled).
 */
export type AssistantStreamEvent =
  | { type: "text"; delta: string }
  | { type: "edit"; path: string; content: string };

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
  /** "chat" edits files; "plan" returns a build plan and never edits. */
  intent?: "chat" | "plan";
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

  const planning =
    params.intent === "plan"
      ? `

PLANNING MODE: Do NOT modify files or call write_file. Produce a concise, practical build plan for this project as a numbered list. For each step name the feature, what to do, and which file(s) to create or change. Keep it specific and buildable — no fluff.`
      : "";

  return `You are Botforge's coding assistant. You help the user build a ${params.project.platform} bot written in ${params.project.language}. The project is called "${params.project.name}".

Rules:
- Keep the project runnable and idiomatic; match the existing structure and style.
- When you add or change code, call the write_file tool with the COMPLETE new file content (never a diff or a fragment).
- Make focused, minimal changes and briefly explain what you did in plain language.
- Never hardcode secrets or tokens — read them from environment variables.
- If the request is just a question, answer it without editing files.${planning}${preferenceLines(params.preferences)}

Current project files:
${fileDump}`;
}

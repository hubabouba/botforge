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

export interface AssistantParams {
  project: { name: string; platform: string; language: string };
  files: { path: string; content: string }[];
  messages: { role: "user" | "assistant"; content: string }[];
}

/** System prompt shared by every provider so behavior is consistent. */
export function buildSystemPrompt(params: AssistantParams): string {
  const fileDump = params.files
    .map((f) => `--- ${f.path} ---\n${f.content.slice(0, 8000)}`)
    .join("\n\n");

  return `You are Botforge's coding assistant. You help the user build a ${params.project.platform} bot written in ${params.project.language}. The project is called "${params.project.name}".

Rules:
- Keep the project runnable and idiomatic; match the existing structure and style.
- When you add or change code, call the write_file tool with the COMPLETE new file content (never a diff or a fragment).
- Make focused, minimal changes and briefly explain what you did in plain language.
- Never hardcode secrets or tokens — read them from environment variables.
- If the request is just a question, answer it without editing files.

Current project files:
${fileDump}`;
}

/** Fallback reply text when a provider returns edits but no prose. */
export function defaultReply(edits: AssistantEdit[]): string {
  return edits.length ? `Prepared changes to ${edits.length} file${edits.length === 1 ? "" : "s"}.` : "Done.";
}

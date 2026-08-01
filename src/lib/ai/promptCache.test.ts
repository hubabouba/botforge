/**
 * Guards the one property the prompt cache depends on: the system prompt holds
 * nothing that changes between messages.
 *
 * This regresses silently. Move the file dump or the bot's runtime state back
 * into buildSystemPrompt and everything still works — every reply is correct,
 * no error is raised anywhere — it just costs several times more, because a
 * changed prefix throws away the cache for everything after it. The only signal
 * is a number in the billing dashboard weeks later. Hence a test.
 */
import { describe, expect, it } from "vitest";
import { buildContextBlock, buildSystemPrompt, type AssistantParams } from "./types";
import { PROGRESS_PATH } from "@/lib/workspace/progress";

const params: AssistantParams = {
  project: { name: "my-bot", platform: "telegram", language: "python", entry: "main.py" },
  files: [
    { path: "main.py", content: "print('hello from main')" },
    { path: PROGRESS_PATH, content: "<!--botforge-progress-->\n# Where you left off\njournal-body" },
  ],
  messages: [{ role: "user", content: "hi" }],
  runtime: "\n\n--- BOT RUNTIME ---\nStatus: running\n--- END BOT RUNTIME ---",
};

describe("prompt split for caching", () => {
  it("keeps everything volatile out of the system prompt", () => {
    const system = buildSystemPrompt(params);
    expect(system).not.toContain("print('hello from main')");
    expect(system).not.toContain("BOT RUNTIME");
    expect(system).not.toContain("Current project files");
  });

  it("puts the files and the runtime state in the context block", () => {
    const context = buildContextBlock(params);
    expect(context).toContain("print('hello from main')");
    expect(context).toContain("BOT RUNTIME");
  });

  it("is byte-identical for two messages that differ only in the files", () => {
    const edited: AssistantParams = { ...params, files: [{ path: "main.py", content: "print('edited')" }] };
    expect(buildSystemPrompt(edited)).toBe(buildSystemPrompt(params));
    expect(buildContextBlock(edited)).not.toBe(buildContextBlock(params));
  });

  it("never sends the progress journal to the model", () => {
    const whole = buildSystemPrompt(params) + buildContextBlock(params);
    expect(whole).not.toContain("journal-body");
    // Not even in the file listing: naming a file it can't see only invites
    // read_file calls that cost a turn and return the model its own history.
    expect(whole).not.toContain(PROGRESS_PATH);
  });
});

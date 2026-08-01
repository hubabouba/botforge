import { describe, expect, it } from "vitest";
import { nextProgress, type ProgressEntry, type ProgressLabels } from "./progress";

const LABELS: ProgressLabels = {
  title: "Where you left off",
  intro: "Updated automatically.",
  asked: "Asked",
  changed: "Files changed",
  reply: "Assistant",
};

const AT = Date.UTC(2026, 7, 1, 12, 0);

function entry(request: string, over: Partial<ProgressEntry> = {}): ProgressEntry {
  return { request, reply: "Done.", files: ["main.py"], at: AT, ...over };
}

describe("nextProgress", () => {
  it("creates the journal when there is none", () => {
    const out = nextProgress(null, entry("add a /help command"), LABELS)!;
    expect(out).toContain("# Where you left off");
    expect(out).toContain("**Asked:** add a /help command");
    expect(out).toContain("**Files changed:** main.py");
  });

  it("puts the newest entry first and keeps the old ones", () => {
    const first = nextProgress(null, entry("first"), LABELS)!;
    const second = nextProgress(first, entry("second"), LABELS)!;
    expect(second.indexOf("second")).toBeLessThan(second.indexOf("first"));
    expect(second).toContain("first");
  });

  it("keeps at most 20 entries", () => {
    let out = nextProgress(null, entry("entry 0"), LABELS)!;
    for (let i = 1; i < 25; i++) out = nextProgress(out, entry(`entry ${i}`), LABELS)!;
    expect(out).toMatch(/\*\*Asked:\*\* entry 24$/m);
    expect(out).toMatch(/\*\*Asked:\*\* entry 5$/m);
    // The five oldest fell off — "entry 4", not "entry 24", so anchor the match.
    expect(out).not.toMatch(/\*\*Asked:\*\* entry 4$/m);
    expect(out).not.toMatch(/\*\*Asked:\*\* entry 0$/m);
    expect(out.split("<!--entry-->").length - 1).toBe(20);
  });

  it("refuses to touch a PROGRESS.md the user wrote", () => {
    expect(nextProgress("# My own notes\n\nRelease checklist…", entry("hi"), LABELS)).toBeNull();
  });

  it("does not let a fenced code block leak out of an entry", () => {
    const out = nextProgress(null, entry("x", { reply: "Here:\n```py\nprint(1)\n```\nDone." }), LABELS)!;
    expect(out).not.toContain("```");
    expect(out).toContain("Done.");
  });

  it("omits the files line when nothing changed", () => {
    const out = nextProgress(null, entry("just a question", { files: [] }), LABELS)!;
    expect(out).not.toContain("Files changed");
  });
});

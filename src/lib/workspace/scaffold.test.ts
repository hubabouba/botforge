import { describe, expect, it } from "vitest";
import { scaffoldProject } from "@/lib/workspace/scaffold";
import type { CreateAnswers } from "@/lib/workspace/scaffold";

/**
 * The generated project has to parse. Nothing downstream checks that — it is
 * written to the database, pulled by the runner, and handed straight to python
 * or node, so a quote in the wrong place surfaces as a traceback on first start
 * with nothing pointing at the real cause: what the user typed into the wizard.
 */
const base: CreateAnswers = {
  name: "my-bot",
  platform: "telegram",
  language: "python",
  type: "blank",
  audience: "personal",
  personality: "",
  purpose: "",
};

const entryOf = (a: CreateAnswers) => {
  const spec = scaffoldProject(a);
  return spec.files.find((f) => f.path === spec.entry)?.content ?? "";
};

/** Every `"` in the file must be either an escaped one or a delimiter. */
function unescapedQuoteCount(line: string): number {
  return (line.match(/(?<!\\)"/g) ?? []).length;
}

describe("scaffoldProject — names and personas that contain quotes", () => {
  it("escapes a double quote in the project name", () => {
    const entry = entryOf({ ...base, name: 'The "best" bot' });
    const greeting = entry.split("\n").find((l) => l.includes("Hello! I'm")) ?? "";
    expect(greeting).toContain('\\"best\\"');
    // Two delimiters and nothing else loose.
    expect(unescapedQuoteCount(greeting)).toBe(2);
  });

  // The persona takes a different route: personaText strips quotes and
  // backslashes outright rather than escaping them. Either is fine — what
  // matters is that the emitted line parses — so this asserts the outcome, not
  // the mechanism, and will keep holding if that ever changes to escaping.
  it("emits a persona line that parses, on both languages", () => {
    for (const language of ["python", "node"] as const) {
      const entry = entryOf({ ...base, language, personality: 'friendly, says "hi" a lot\\ever' });
      // The assignment, not the comment above it — both mention PERSONA.
      const line = entry.split("\n").find((l) => l.includes('PERSONA = "')) ?? "";
      expect(line).toContain("friendly");
      expect(unescapedQuoteCount(line)).toBe(2);
      expect(line.endsWith('"') || line.endsWith('";')).toBe(true);
    }
  });

  it("flattens a pasted multi-line persona onto one line", () => {
    const entry = entryOf({ ...base, personality: "line one\nline two" });
    const line = entry.split("\n").find((l) => l.startsWith("PERSONA")) ?? "";
    expect(line).toContain("line one line two");
  });

  it("survives a backslash without leaving a dangling escape", () => {
    const entry = entryOf({ ...base, name: "back\\slash" });
    const greeting = entry.split("\n").find((l) => l.includes("Hello! I'm")) ?? "";
    expect(greeting).toContain("back\\\\slash");
    expect(unescapedQuoteCount(greeting)).toBe(2);
  });

  it("still adds no PERSONA constant when there is no persona", () => {
    expect(entryOf({ ...base, personality: "" })).not.toContain("PERSONA");
    expect(entryOf({ ...base, personality: "   " })).not.toContain("PERSONA");
  });
});

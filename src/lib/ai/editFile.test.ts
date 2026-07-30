import { describe, expect, it } from "vitest";
import { applyStringEdit, countOccurrences, editFailureMessage } from "@/lib/ai/editFile";

const FILE = `import logging

async def start(update, ctx):
    await update.message.reply_text("Hi!")

async def help_cmd(update, ctx):
    await update.message.reply_text("Hi!")
`;

describe("applyStringEdit", () => {
  it("replaces the one occurrence and leaves everything else byte for byte", () => {
    const r = applyStringEdit(FILE, 'async def start(update, ctx):', 'async def start(update, ctx) -> None:');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.content).toContain("async def start(update, ctx) -> None:");
    // The other function, the import and the trailing newline all survive.
    expect(r.content).toContain("async def help_cmd(update, ctx):");
    expect(r.content.startsWith("import logging")).toBe(true);
    expect(r.content.endsWith("\n")).toBe(true);
  });

  it("treats an empty new_string as a deletion", () => {
    const r = applyStringEdit("keep\nDROP ME\nkeep", "\nDROP ME", "");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.content).toBe("keep\nkeep");
  });

  /**
   * The case that protects the user's code. Both functions here reply with the
   * same line; replacing "it" would be a coin flip between them, and picking
   * wrong edits code the user never asked about.
   */
  it("refuses an ambiguous match rather than guessing which one", () => {
    const r = applyStringEdit(FILE, '    await update.message.reply_text("Hi!")', "    pass");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("ambiguous");
    if (r.reason === "ambiguous") expect(r.occurrences).toBe(2);
  });

  it("reports a miss instead of appending or approximating", () => {
    const r = applyStringEdit(FILE, "async def start(update, context):", "x");
    expect(r).toEqual({ ok: false, reason: "not_found" });
  });

  /**
   * Whitespace is never normalised. Python is the main language here, so a
   * match that treated a tab as equivalent to four spaces could silently
   * reindent a block and change what the code means.
   */
  it("does not treat a tab as equal to spaces", () => {
    const tabbed = "def f():\n\tif x:\n\t\treturn 1\n";
    expect(applyStringEdit(tabbed, "    if x:", "    if y:")).toEqual({ ok: false, reason: "not_found" });
    const r = applyStringEdit(tabbed, "\tif x:", "\tif y:");
    expect(r.ok && r.content).toBe("def f():\n\tif y:\n\t\treturn 1\n");
  });

  it("rejects a no-op edit and an empty target", () => {
    expect(applyStringEdit(FILE, "import logging", "import logging")).toEqual({ ok: false, reason: "identical" });
    expect(applyStringEdit(FILE, "", "x")).toEqual({ ok: false, reason: "empty_target" });
  });

  it("handles a match at the very start and very end of a file", () => {
    const start = applyStringEdit("AAAtail", "AAA", "BBB");
    expect(start.ok && start.content).toBe("BBBtail");
    const end = applyStringEdit("headZZZ", "ZZZ", "YYY");
    expect(end.ok && end.content).toBe("headYYY");
  });
});

describe("countOccurrences", () => {
  it("counts non-overlapping matches", () => {
    expect(countOccurrences("aaaa", "aa")).toBe(2);
    expect(countOccurrences("abcabc", "abc")).toBe(2);
    expect(countOccurrences("abc", "z")).toBe(0);
    expect(countOccurrences("abc", "")).toBe(0);
  });
});

describe("editFailureMessage", () => {
  // These are read by a model that can retry, so each has to say what to do
  // next — a bare diagnosis would just produce the same call again.
  it("tells the model how to recover from each failure", () => {
    expect(editFailureMessage("main.py", { reason: "not_found" })).toMatch(/read_file/);
    expect(editFailureMessage("main.py", { reason: "ambiguous", occurrences: 3 })).toMatch(/3 times/);
    expect(editFailureMessage("main.py", { reason: "ambiguous", occurrences: 3 })).toMatch(/more surrounding lines/);
    expect(editFailureMessage("main.py", { reason: "identical" })).toMatch(/new_string/);
    expect(editFailureMessage("main.py", { reason: "empty_target" })).toMatch(/write_file/);
  });
});

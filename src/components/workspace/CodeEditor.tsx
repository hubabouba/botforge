"use client";

import { useMemo, useRef, useState } from "react";
import { highlightToLines, TOKEN_COLORS } from "@/lib/workspace/highlight";
import { langOf, type Lang, type ProjectFile } from "@/lib/workspace/types";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { plural } from "@/lib/i18n/plural";
import { cn } from "@/lib/utils";

const PAIRS: Record<string, string> = { "(": ")", "[": "]", "{": "}", '"': '"', "'": "'", "`": "`" };
const CLOSERS = new Set([")", "]", "}", '"', "'", "`"]);

const LANG_LABEL: Record<Lang, string> = {
  python: "Python",
  typescript: "TypeScript",
  javascript: "JavaScript",
  json: "JSON",
  markdown: "Markdown",
  env: "Dotenv",
  text: "Text",
};

/**
 * Editable, syntax-highlighted editor (transparent textarea over highlighted
 * <pre>) with editor comforts: auto-indent, auto-closing pairs, tab/untab,
 * Cmd/Ctrl+S, an active-line marker in the gutter and a status bar.
 */
export function CodeEditor({
  file,
  onChange,
  onSave,
}: {
  file: ProjectFile;
  onChange: (content: string) => void;
  onSave?: () => void;
}) {
  const { t, lang: uiLang } = useI18n();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(file.content);
  const [caret, setCaret] = useState({ line: 1, col: 1 });
  const lang = langOf(file.path);
  const lines = useMemo(() => highlightToLines(value, lang), [value, lang]);

  function commit(next: string, selStart: number, selEnd = selStart) {
    setValue(next);
    onChange(next);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.selectionStart = selStart;
      el.selectionEnd = selEnd;
      updateCaret(next, selStart);
    });
  }

  function updateCaret(text: string, pos: number) {
    const before = text.slice(0, pos);
    const line = before.split("\n").length;
    const col = pos - before.lastIndexOf("\n");
    setCaret({ line, col });
  }

  function syncCaret() {
    const el = ref.current;
    if (el) updateCaret(value, el.selectionStart);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    const s = el.selectionStart;
    const en = el.selectionEnd;
    const k = e.key;

    // Save
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "s") {
      e.preventDefault();
      onSave?.();
      return;
    }

    // Tab / Shift+Tab
    if (k === "Tab") {
      e.preventDefault();

      // Multi-line selection: indent/dedent every touched line (never delete it).
      if (s !== en && value.slice(s, en).includes("\n")) {
        const blockStart = value.lastIndexOf("\n", s - 1) + 1;
        const block = value.slice(blockStart, en);
        const next = e.shiftKey ? block.replace(/^ {1,2}/gm, "") : block.replace(/^(?!$)/gm, "  ");
        commit(value.slice(0, blockStart) + next + value.slice(en), blockStart, blockStart + next.length);
        return;
      }

      if (e.shiftKey) {
        const lineStart = value.lastIndexOf("\n", s - 1) + 1;
        const lead = value.slice(lineStart).match(/^ {1,2}/);
        if (lead) {
          const removed = lead[0].length;
          commit(value.slice(0, lineStart) + value.slice(lineStart + removed), Math.max(lineStart, s - removed));
        }
      } else {
        commit(value.slice(0, s) + "  " + value.slice(en), s + 2);
      }
      return;
    }

    // Enter: keep indentation, add a level after an opener
    if (k === "Enter") {
      e.preventDefault();
      const lineStart = value.lastIndexOf("\n", s - 1) + 1;
      const curLine = value.slice(lineStart, s);
      const indent = (curLine.match(/^[ \t]*/) ?? [""])[0];
      const opensBlock = /[:{([]\s*$/.test(curLine);
      const inPair = CLOSERS.has(value[s]) && PAIRS[value[s - 1]] === value[s];
      if (inPair) {
        const insert = "\n" + indent + "  " + "\n" + indent;
        commit(value.slice(0, s) + insert + value.slice(en), s + 1 + indent.length + 2);
      } else {
        const insert = "\n" + indent + (opensBlock ? "  " : "");
        commit(value.slice(0, s) + insert + value.slice(en), s + insert.length);
      }
      return;
    }

    // Auto-close pairs (and wrap a selection)
    if (PAIRS[k] && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (s !== en) {
        const sel = value.slice(s, en);
        commit(value.slice(0, s) + k + sel + PAIRS[k] + value.slice(en), s + 1, en + 1);
      } else {
        commit(value.slice(0, s) + k + PAIRS[k] + value.slice(en), s + 1);
      }
      return;
    }

    // Type-over an auto-inserted closer
    if (CLOSERS.has(k) && s === en && value[s] === k) {
      e.preventDefault();
      commit(value, s + 1);
      return;
    }

    // Backspace deletes an empty pair
    if (k === "Backspace" && s === en && s > 0 && PAIRS[value[s - 1]] === value[s]) {
      e.preventDefault();
      commit(value.slice(0, s - 1) + value.slice(s + 1), s - 1);
      return;
    }
  }

  const shared = "font-mono text-[13px] leading-[1.65] tracking-normal";
  const activeLine = caret.line - 1;

  return (
    <div className="flex h-full flex-col bg-ink-950">
      <div className="relative min-h-0 flex-1 overflow-auto">
        <div className="flex min-h-full min-w-max">
          {/* Gutter */}
          <div
            aria-hidden
            className={cn("sticky left-0 z-10 select-none border-r border-ink-800 bg-ink-950 px-3 py-3 text-right", shared)}
          >
            {lines.map((_, i) => (
              <div key={i} className={cn("tabular-nums", i === activeLine ? "text-neutral-300" : "text-neutral-600")}>
                {i + 1}
              </div>
            ))}
          </div>

          {/* Code area */}
          <div className="relative">
            <pre className={cn("m-0 whitespace-pre px-4 py-3", shared)} aria-hidden>
              {lines.map((tokens, i) => (
                <div key={i} className={cn(i === activeLine && "bg-white/[0.03]")}>
                  {tokens.length === 0
                    ? " "
                    : tokens.map((t, j) => (
                        <span key={j} className={cn(TOKEN_COLORS[t.type])}>
                          {t.value}
                        </span>
                      ))}
                </div>
              ))}
            </pre>
            <textarea
              ref={ref}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                onChange(e.target.value);
                updateCaret(e.target.value, e.target.selectionStart);
              }}
              onKeyDown={onKeyDown}
              onKeyUp={syncCaret}
              onClick={syncCaret}
              onSelect={syncCaret}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              wrap="off"
              className={cn(
                "absolute inset-0 resize-none overflow-hidden whitespace-pre bg-transparent px-4 py-3 text-transparent caret-neutral-100 outline-none selection:bg-accent/30",
                shared,
              )}
            />
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex h-6 shrink-0 items-center gap-4 border-t border-ink-800 bg-ink-950 px-3 text-[11px] text-neutral-500">
        <span>
          {t("editor.ln")} {caret.line}, {t("editor.col")} {caret.col}
        </span>
        <span>{t("editor.spaces")}</span>
        <span className="ml-auto">
          {lines.length} {plural(uiLang, lines.length, { en: ["line", "lines"], ru: ["строка", "строки", "строк"] })}
        </span>
        <span className="text-neutral-400">{LANG_LABEL[lang]}</span>
      </div>
    </div>
  );
}

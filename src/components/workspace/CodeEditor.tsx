"use client";

import { useMemo, useRef, useState } from "react";
import { highlightToLines, TOKEN_COLORS } from "@/lib/workspace/highlight";
import { langOf, type Lang, type ProjectFile } from "@/lib/workspace/types";
import { Copy, Check } from "@/components/icons";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { plural } from "@/lib/i18n/plural";
import { cn } from "@/lib/utils";

const PAIRS: Record<string, string> = { "(": ")", "[": "]", "{": "}", '"': '"', "'": "'", "`": "`" };
const CLOSERS = new Set([")", "]", "}", '"', "'", "`"]);

/** Line-comment token per language (absent = no line comment, e.g. json). */
const LINE_COMMENT: Partial<Record<Lang, string>> = {
  python: "#",
  env: "#",
  javascript: "//",
  typescript: "//",
};
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
  const [selLen, setSelLen] = useState(0);
  const [copied, setCopied] = useState(false);
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
    if (el) {
      updateCaret(value, el.selectionStart);
      setSelLen(el.selectionEnd - el.selectionStart);
    }
  }

  function copyFile() {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  }

  /** Full-line bounds covering the current selection (offsets into `value`). */
  function blockBounds(s: number, en: number): [number, number] {
    const start = value.lastIndexOf("\n", s - 1) + 1;
    let end = value.indexOf("\n", en);
    if (end === -1) end = value.length;
    return [start, end];
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

    // Toggle line comment (Ctrl/Cmd + /) across the touched lines.
    if ((e.ctrlKey || e.metaKey) && k === "/") {
      const token = LINE_COMMENT[lang];
      if (!token) return; // languages without a line comment (json) — no-op
      e.preventDefault();
      const [bStart, bEnd] = blockBounds(s, en);
      const blockLines = value.slice(bStart, bEnd).split("\n");
      const meaningful = blockLines.filter((l) => l.trim());
      const allOn = meaningful.length > 0 && meaningful.every((l) => l.trimStart().startsWith(token));
      const strip = new RegExp(`^(\\s*)${escapeRe(token)} ?`);
      const out = blockLines
        .map((l) => {
          if (!l.trim()) return l;
          if (allOn) return l.replace(strip, "$1");
          const indent = (l.match(/^\s*/) ?? [""])[0];
          return indent + token + " " + l.slice(indent.length);
        })
        .join("\n");
      commit(value.slice(0, bStart) + out + value.slice(bEnd), bStart, bStart + out.length);
      return;
    }

    // Duplicate the current line / selected block (Shift+Alt+Up/Down).
    if (e.altKey && e.shiftKey && (k === "ArrowUp" || k === "ArrowDown")) {
      e.preventDefault();
      const [bStart, bEnd] = blockBounds(s, en);
      const block = value.slice(bStart, bEnd);
      const selStart = k === "ArrowDown" ? bStart + block.length + 1 : bStart;
      commit(value.slice(0, bStart) + block + "\n" + block + value.slice(bEnd), selStart, selStart + block.length);
      return;
    }

    // Move the current line / selected block (Alt+Up/Down).
    if (e.altKey && !e.shiftKey && (k === "ArrowUp" || k === "ArrowDown")) {
      const [bStart, bEnd] = blockBounds(s, en);
      if (k === "ArrowUp") {
        if (bStart === 0) return; // already at the top
        e.preventDefault();
        const prevStart = value.lastIndexOf("\n", bStart - 2) + 1;
        const prevLine = value.slice(prevStart, bStart - 1);
        const block = value.slice(bStart, bEnd);
        const delta = bStart - prevStart;
        commit(value.slice(0, prevStart) + block + "\n" + prevLine + value.slice(bEnd), s - delta, en - delta);
      } else {
        if (bEnd >= value.length) return; // no line below to swap with
        e.preventDefault();
        const nextEnd0 = value.indexOf("\n", bEnd + 1);
        const nextEnd = nextEnd0 === -1 ? value.length : nextEnd0;
        const nextLine = value.slice(bEnd + 1, nextEnd);
        const block = value.slice(bStart, bEnd);
        const delta = nextLine.length + 1;
        commit(value.slice(0, bStart) + nextLine + "\n" + block + value.slice(nextEnd), s + delta, en + delta);
      }
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
      <div className="flex h-6 shrink-0 items-center gap-3 border-t border-ink-800 bg-ink-950 px-3 text-[11px] text-neutral-500">
        <span>
          {t("editor.ln")} {caret.line}, {t("editor.col")} {caret.col}
        </span>
        <span>{t("editor.spaces")}</span>
        {selLen > 0 && <span className="text-neutral-400">{selLen} {t("editor.selected")}</span>}

        <span
          title={t("editor.shortcutsHint")}
          className="ml-auto cursor-help select-none rounded border border-ink-700 px-1 text-[10px] text-neutral-500 hover:text-neutral-300"
        >
          ?
        </span>
        <button
          onClick={copyFile}
          title={t("editor.copyFile")}
          className="inline-flex items-center gap-1 rounded px-1 text-neutral-500 transition-colors hover:text-neutral-200"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          {copied ? t("editor.copied") : t("editor.copy")}
        </button>
        <span>
          {lines.length} {plural(uiLang, lines.length, { en: ["line", "lines"], ru: ["строка", "строки", "строк"] })}
        </span>
        <span className="text-neutral-400">{LANG_LABEL[lang]}</span>
      </div>
    </div>
  );
}

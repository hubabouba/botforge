"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { highlightToLines, TOKEN_COLORS } from "@/lib/workspace/highlight";
import { langOf, type Lang, type ProjectFile } from "@/lib/workspace/types";
import { Copy, Check, Close, ChevronRight } from "@/components/icons";
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
  // Undo/redo: commit() sets the value programmatically, which throws away the
  // textarea's native undo stack — so we keep our own. Each entry is a full
  // snapshot; a burst of typing coalesces into one step while structural edits
  // (Tab, Enter, comment, move…) each get their own boundary.
  const history = useRef<{ stack: { value: string; selStart: number; selEnd: number }[]; index: number }>({
    stack: [{ value: file.content, selStart: 0, selEnd: 0 }],
    index: 0,
  });
  const lastEdit = useRef<{ time: number; kind: "type" | "struct" | "none" }>({ time: 0, kind: "none" });
  const [caret, setCaret] = useState({ line: 1, col: 1 });
  const [selLen, setSelLen] = useState(0);
  const [copied, setCopied] = useState(false);
  // ---- Find / replace ----
  const findRef = useRef<HTMLInputElement>(null);
  const activeMatchRef = useRef<HTMLSpanElement>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [replaceMode, setReplaceMode] = useState(false);
  const [query, setQuery] = useState("");
  const [replaceValue, setReplaceValue] = useState("");
  const [activeMatch, setActiveMatch] = useState(-1);
  const lang = langOf(file.path);
  const lines = useMemo(() => highlightToLines(value, lang), [value, lang]);

  function commit(next: string, selStart: number, selEnd = selStart) {
    record(next, selStart, selEnd, "struct");
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

  // Push a snapshot onto the undo stack. Consecutive typing within a short
  // window collapses into a single entry (one Ctrl+Z removes a word, not a
  // character); structural edits never coalesce. A no-op (same text) only
  // nudges the current entry's caret.
  function record(next: string, selStart: number, selEnd: number, kind: "type" | "struct") {
    const h = history.current;
    const top = h.stack[h.index];
    if (next === top.value) {
      top.selStart = selStart;
      top.selEnd = selEnd;
      return;
    }
    if (h.index < h.stack.length - 1) h.stack.length = h.index + 1; // drop redo tail
    const now = Date.now();
    const coalesce = kind === "type" && lastEdit.current.kind === "type" && now - lastEdit.current.time < 600;
    if (coalesce) {
      h.stack[h.index] = { value: next, selStart, selEnd };
    } else {
      h.stack.push({ value: next, selStart, selEnd });
      if (h.stack.length > 300) h.stack.shift();
      h.index = h.stack.length - 1;
    }
    lastEdit.current = { time: now, kind };
  }

  function applySnapshot(snap: { value: string; selStart: number; selEnd: number }) {
    setValue(snap.value);
    onChange(snap.value);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.selectionStart = snap.selStart;
      el.selectionEnd = snap.selEnd;
      updateCaret(snap.value, snap.selStart);
    });
  }

  function undo() {
    const h = history.current;
    if (h.index <= 0) return;
    h.index -= 1;
    lastEdit.current.kind = "none"; // next keystroke starts a fresh burst
    applySnapshot(h.stack[h.index]);
  }

  function redo() {
    const h = history.current;
    if (h.index >= h.stack.length - 1) return;
    h.index += 1;
    lastEdit.current.kind = "none";
    applySnapshot(h.stack[h.index]);
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

  // ---- Find / replace ------------------------------------------------------
  // Case-insensitive plain-substring matches (no regex — matches the file's
  // deliberately simple style). Only computed while the find bar is open.
  const matches = useMemo(() => {
    if (!findOpen || !query) return [];
    const out: number[] = [];
    const hay = value.toLowerCase();
    const needle = query.toLowerCase();
    let i = hay.indexOf(needle);
    while (i !== -1) {
      out.push(i);
      i = hay.indexOf(needle, i + needle.length);
    }
    return out;
  }, [findOpen, query, value]);

  // When the match set changes, land on the first match at/after the caret.
  useEffect(() => {
    if (matches.length === 0) {
      setActiveMatch(-1);
      return;
    }
    const caretPos = ref.current?.selectionStart ?? 0;
    const idx = matches.findIndex((m) => m >= caretPos);
    setActiveMatch(idx === -1 ? 0 : idx);
  }, [matches]);

  // Select + scroll the active match into view whenever it (or the set) moves.
  useEffect(() => {
    if (activeMatch < 0 || activeMatch >= matches.length) return;
    const el = ref.current;
    const pos = matches[activeMatch];
    if (el) {
      el.selectionStart = pos;
      el.selectionEnd = pos + query.length;
      updateCaret(value, pos);
    }
    activeMatchRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMatch, matches]);

  const openFind = useCallback((withReplace: boolean) => {
    const el = ref.current;
    // Read the live DOM value (not the `value` closure) so this stays stable.
    const sel = el && el.selectionEnd > el.selectionStart ? el.value.slice(el.selectionStart, el.selectionEnd) : "";
    if (sel && !sel.includes("\n")) setQuery(sel);
    setFindOpen(true);
    setReplaceMode(withReplace);
    requestAnimationFrame(() => findRef.current?.select());
  }, []);

  // Ctrl/Cmd+F (find) and Ctrl/Cmd+H (replace). Bound at the window level while
  // the editor is mounted (only on the code view), so it works regardless of
  // where focus sits — opening a file doesn't focus the textarea, and focus may
  // be in the chat composer. On the code view, find-in-code always wins over
  // the browser's native find.
  useEffect(() => {
    const onWinKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key !== "f" && key !== "h") return;
      e.preventDefault();
      openFind(key === "h");
    };
    window.addEventListener("keydown", onWinKey);
    return () => window.removeEventListener("keydown", onWinKey);
  }, [openFind]);

  function closeFind() {
    setFindOpen(false);
    requestAnimationFrame(() => ref.current?.focus());
  }

  function step(dir: 1 | -1) {
    if (matches.length === 0) return;
    setActiveMatch((prev) => {
      const base = prev < 0 ? 0 : prev;
      return (base + dir + matches.length) % matches.length;
    });
  }

  function replaceOne() {
    if (activeMatch < 0 || activeMatch >= matches.length) return;
    const pos = matches[activeMatch];
    commit(value.slice(0, pos) + replaceValue + value.slice(pos + query.length), pos + replaceValue.length);
  }

  function replaceAll() {
    if (!query || matches.length === 0) return;
    let out = "";
    let cur = 0;
    for (const m of matches) {
      out += value.slice(cur, m) + replaceValue;
      cur = m + query.length;
    }
    out += value.slice(cur);
    commit(out, out.length);
  }

  function onFindKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      step(e.shiftKey ? -1 : 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeFind();
    }
  }

  /** One overlay line: transparent text with match ranges given a highlight bg. */
  function renderMatchLine(lineText: string, lineStart: number): React.ReactNode {
    const q = query.length;
    const lineEnd = lineStart + lineText.length;
    const nodes: React.ReactNode[] = [];
    let cursor = 0;
    for (let mi = 0; mi < matches.length; mi++) {
      const m = matches[mi];
      if (m + q <= lineStart) continue;
      if (m >= lineEnd) break;
      const relS = m - lineStart;
      if (relS > cursor) nodes.push(<span key={cursor} className="text-transparent">{lineText.slice(cursor, relS)}</span>);
      nodes.push(
        <span
          key={"m" + m}
          ref={mi === activeMatch ? activeMatchRef : undefined}
          className={cn("rounded-[2px] text-transparent", mi === activeMatch ? "bg-amber-400/60" : "bg-amber-400/25")}
        >
          {lineText.slice(relS, relS + q)}
        </span>,
      );
      cursor = relS + q;
    }
    if (nodes.length === 0) return <span className="text-transparent">{lineText || " "}</span>;
    if (cursor < lineText.length) nodes.push(<span key="tail" className="text-transparent">{lineText.slice(cursor)}</span>);
    return nodes;
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    const s = el.selectionStart;
    const en = el.selectionEnd;
    const k = e.key;

    // Escape closes the find bar (the window listener above handles opening it).
    if (k === "Escape" && findOpen) {
      e.preventDefault();
      closeFind();
      return;
    }

    // Undo / redo — our own stack, since commit() bypasses the native one.
    // Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y redo.
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "y") {
      e.preventDefault();
      redo();
      return;
    }

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
    <div className="relative flex h-full flex-col bg-ink-950">
      {findOpen && (
        <div className="absolute right-3 top-2 z-20 rounded-lg border border-ink-700 bg-ink-900/95 p-1.5 shadow-lift backdrop-blur">
          <div className="flex items-center gap-1">
            <input
              ref={findRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onFindKeyDown}
              placeholder={t("editor.findPlaceholder")}
              className="w-40 rounded bg-ink-950 px-2 py-1 font-mono text-xs text-neutral-100 outline-none placeholder:font-sans placeholder:text-neutral-600"
            />
            <span className="min-w-[3.25rem] shrink-0 text-center text-[11px] tabular-nums text-neutral-500">
              {matches.length ? `${Math.max(activeMatch, 0) + 1}/${matches.length}` : "0/0"}
            </span>
            <button
              onClick={() => step(-1)}
              disabled={!matches.length}
              title={t("editor.findPrev")}
              className="grid h-6 w-6 shrink-0 place-items-center rounded text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-100 disabled:opacity-30"
            >
              ↑
            </button>
            <button
              onClick={() => step(1)}
              disabled={!matches.length}
              title={t("editor.findNext")}
              className="grid h-6 w-6 shrink-0 place-items-center rounded text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-100 disabled:opacity-30"
            >
              ↓
            </button>
            <button
              onClick={() => setReplaceMode((v) => !v)}
              aria-pressed={replaceMode}
              title={t("editor.replace")}
              className={cn(
                "grid h-6 w-6 shrink-0 place-items-center rounded transition-colors hover:bg-white/10 hover:text-neutral-100",
                replaceMode ? "text-neutral-100" : "text-neutral-400",
              )}
            >
              <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", replaceMode && "rotate-90")} />
            </button>
            <button
              onClick={closeFind}
              title={t("ws.close")}
              className="grid h-6 w-6 shrink-0 place-items-center rounded text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-100"
            >
              <Close className="h-3.5 w-3.5" />
            </button>
          </div>
          {replaceMode && (
            <div className="mt-1 flex items-center gap-1">
              <input
                value={replaceValue}
                onChange={(e) => setReplaceValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    replaceOne();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    closeFind();
                  }
                }}
                placeholder={t("editor.replacePlaceholder")}
                className="w-40 rounded bg-ink-950 px-2 py-1 font-mono text-xs text-neutral-100 outline-none placeholder:font-sans placeholder:text-neutral-600"
              />
              <button
                onClick={replaceOne}
                disabled={!matches.length}
                className="shrink-0 rounded px-2 py-1 text-[11px] text-neutral-300 transition-colors hover:bg-white/10 hover:text-neutral-100 disabled:opacity-30"
              >
                {t("editor.replace")}
              </button>
              <button
                onClick={replaceAll}
                disabled={!matches.length}
                className="shrink-0 rounded px-2 py-1 text-[11px] text-neutral-300 transition-colors hover:bg-white/10 hover:text-neutral-100 disabled:opacity-30"
              >
                {t("editor.replaceAll")}
              </button>
            </div>
          )}
        </div>
      )}
      <div className="relative min-h-0 flex-1 overflow-auto">
        <div className="flex min-h-full min-w-max">
          {/* Gutter */}
          <div
            aria-hidden
            className={cn("sticky left-0 z-10 select-none border-r border-ink-800 bg-ink-950 px-3 py-3 text-right", shared)}
          >
            {lines.map((_, i) => (
              <div key={i} className={cn("tabular-nums", i === activeLine ? "text-accent" : "text-neutral-600")}>
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
            {/* Find highlight overlay: transparent text so the code shows
                through from the <pre> below; only match backgrounds paint. */}
            {findOpen && query && (
              <div aria-hidden className={cn("pointer-events-none absolute inset-0 px-4 py-3", shared)}>
                {(() => {
                  let off = 0;
                  return value.split("\n").map((lineText, i) => {
                    const start = off;
                    off += lineText.length + 1;
                    return <div key={i}>{renderMatchLine(lineText, start)}</div>;
                  });
                })()}
              </div>
            )}
            <textarea
              ref={ref}
              value={value}
              onChange={(e) => {
                record(e.target.value, e.target.selectionStart, e.target.selectionStart, "type");
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
          className="ml-auto cursor-help select-none rounded border border-ink-700 px-1 text-[11px] text-neutral-500 hover:text-neutral-300"
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

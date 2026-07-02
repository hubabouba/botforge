"use client";

import { useMemo, useState } from "react";
import { highlightToLines, TOKEN_COLORS } from "@/lib/workspace/highlight";
import { langOf, type ProjectFile } from "@/lib/workspace/types";
import { cn } from "@/lib/utils";

/**
 * Editable, syntax-highlighted code editor with a line-number gutter.
 *
 * Technique: a transparent <textarea> sits exactly on top of a highlighted
 * <pre>. They share identical font metrics and padding, so the caret and
 * selection land on the colored text underneath — real editing, no Monaco/CDN.
 * The parent remounts this via `key={file.path}`, so local state stays simple.
 */
export function CodeEditor({
  file,
  onChange,
}: {
  file: ProjectFile;
  onChange: (content: string) => void;
}) {
  const [value, setValue] = useState(file.content);
  const lang = langOf(file.path);
  const lines = useMemo(() => highlightToLines(value, lang), [value, lang]);

  function handle(next: string) {
    setValue(next);
    onChange(next);
  }

  // Insert a soft tab (2 spaces) instead of moving focus.
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Tab") {
      e.preventDefault();
      const el = e.currentTarget;
      const { selectionStart: s, selectionEnd: end } = el;
      const next = value.slice(0, s) + "  " + value.slice(end);
      handle(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = s + 2;
      });
    }
  }

  const shared = "font-mono text-[13px] leading-[1.65] tracking-normal";

  return (
    <div className="relative h-full overflow-auto bg-ink-950">
      <div className="flex min-h-full min-w-max">
        {/* Gutter */}
        <div
          aria-hidden
          className={cn(
            "sticky left-0 z-10 select-none border-r border-ink-800 bg-ink-950 px-3 py-3 text-right",
            shared,
          )}
        >
          {lines.map((_, i) => (
            <div key={i} className="tabular-nums text-neutral-600">
              {i + 1}
            </div>
          ))}
        </div>

        {/* Code area: highlighted <pre> under a transparent <textarea> */}
        <div className="relative">
          <pre className={cn("m-0 whitespace-pre px-4 py-3", shared)} aria-hidden>
            {lines.map((tokens, i) => (
              <div key={i}>
                {tokens.length === 0
                  ? " "
                  : tokens.map((t, j) => (
                      <span key={j} className={cn(TOKEN_COLORS[t.type])}>
                        {t.value}
                      </span>
                    ))}
              </div>
            ))}
          </pre>
          <textarea
            value={value}
            onChange={(e) => handle(e.target.value)}
            onKeyDown={onKeyDown}
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
  );
}

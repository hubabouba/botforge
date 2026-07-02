"use client";

import { useMemo } from "react";
import { highlightToLines, TOKEN_COLORS } from "@/lib/workspace/highlight";
import { langOf, type ProjectFile } from "@/lib/workspace/types";
import { cn } from "@/lib/utils";

/**
 * Read-only, syntax-highlighted code view with a line-number gutter.
 * Inline editing arrives once the AI backend can round-trip file changes.
 */
export function CodeEditor({ file }: { file: ProjectFile }) {
  const lines = useMemo(() => highlightToLines(file.content, langOf(file.path)), [file.content, file.path]);

  return (
    <div className="relative h-full overflow-auto bg-ink-950 font-mono text-[13px] leading-[1.65]">
      <div className="flex min-h-full min-w-max">
        {/* Gutter */}
        <div
          aria-hidden
          className="sticky left-0 select-none border-r border-ink-800 bg-ink-950 px-3 py-3 text-right"
        >
          {lines.map((_, i) => (
            <div key={i} className="tabular-nums text-neutral-600">
              {i + 1}
            </div>
          ))}
        </div>

        {/* Code */}
        <div className="py-3 pl-4 pr-8">
          {lines.map((tokens, i) => (
            <div key={i} className="whitespace-pre">
              {tokens.length === 0 ? (
                <span>&nbsp;</span>
              ) : (
                tokens.map((t, j) => (
                  <span key={j} className={cn(TOKEN_COLORS[t.type])}>
                    {t.value}
                  </span>
                ))
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

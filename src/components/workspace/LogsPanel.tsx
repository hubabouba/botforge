"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export interface LogLine {
  id: string;
  level: "info" | "warn" | "error" | "success" | "cmd";
  time: string;
  text: string;
}

const LEVEL: Record<LogLine["level"], { badge: string; color: string; label: string }> = {
  info: { badge: "bg-sky-500/15 text-sky-300", color: "text-neutral-300", label: "INFO" },
  warn: { badge: "bg-amber-500/15 text-amber-300", color: "text-amber-200", label: "WARN" },
  error: { badge: "bg-rose-500/15 text-rose-300", color: "text-rose-200", label: "ERR " },
  success: { badge: "bg-emerald-500/15 text-emerald-300", color: "text-emerald-200", label: "OK  " },
  cmd: { badge: "bg-white/10 text-neutral-300", color: "text-neutral-400", label: "$   " },
};

export function LogsPanel({ logs, running }: { logs: LogLine[]; running: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [logs]);

  return (
    <div className="flex h-full flex-col bg-ink-950">
      <div className="flex items-center gap-2 border-b border-ink-800 px-4 py-2">
        <span className={cn("h-2 w-2 rounded-full", running ? "bg-emerald-400" : "bg-neutral-600")} />
        <span className="text-xs font-medium text-neutral-300">Runtime logs</span>
        <span className="ml-auto font-mono text-[11px] text-neutral-600">
          {running ? "process alive · polling" : "process stopped"}
        </span>
      </div>
      <div ref={ref} className="flex-1 overflow-y-auto p-3 font-mono text-[12px] leading-relaxed">
        {logs.length === 0 ? (
          <div className="grid h-full place-items-center text-center text-neutral-600">
            <div>
              <p className="text-sm">No logs yet</p>
              <p className="mt-1 text-xs">Press ▶ Run to boot the bot and stream output here.</p>
            </div>
          </div>
        ) : (
          logs.map((l) => {
            const s = LEVEL[l.level];
            return (
              <div key={l.id} className="flex gap-3 py-0.5">
                <span className="shrink-0 text-neutral-600">{l.time}</span>
                <span className={cn("shrink-0 rounded px-1 text-[10px] font-semibold", s.badge)}>{s.label.trim()}</span>
                <span className={cn("whitespace-pre-wrap break-words", s.color)}>{l.text}</span>
              </div>
            );
          })
        )}
        {running && <span className="ml-1 inline-block h-3.5 w-1.5 animate-blink bg-accent align-middle" />}
      </div>
    </div>
  );
}

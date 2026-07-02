"use client";

import Link from "next/link";
import { Logo } from "@/components/marketing/Logo";
import type { Project } from "@/lib/workspace/types";
import { cn } from "@/lib/utils";

export type WorkspaceTab = "Code" | "Architecture" | "Logs" | "Analytics";
const TABS: WorkspaceTab[] = ["Code", "Architecture", "Logs", "Analytics"];

export type RunState = "idle" | "starting" | "running";

function PlatformBadge({ platform }: { platform: Project["platform"] }) {
  const label = platform === "telegram" ? "Telegram" : "Discord";
  const color = platform === "telegram" ? "text-[#2aabee]" : "text-[#5865f2]";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md bg-white/[0.04] px-2 py-0.5 text-[11px]", color)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

export function TopBar({
  project,
  tab,
  onTab,
  runState,
  onRun,
}: {
  project: Project;
  tab: WorkspaceTab;
  onTab: (t: WorkspaceTab) => void;
  runState: RunState;
  onRun: () => void;
}) {
  const langLabel = project.language === "python" ? "Python" : "Node.js";

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-ink-800 bg-ink-950 px-3">
      {/* Left: back + identity */}
      <Link
        href="/dashboard"
        className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-neutral-400 transition-colors hover:bg-white/[0.05] hover:text-neutral-200"
        title="Back to dashboard"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
        <Logo className="h-5 w-5" />
      </Link>
      <div className="hidden items-center gap-2 sm:flex">
        <span className="text-sm font-medium text-neutral-100">{project.name}</span>
        <PlatformBadge platform={project.platform} />
        <span className="rounded-md bg-white/[0.04] px-2 py-0.5 text-[11px] text-neutral-400">{langLabel}</span>
      </div>

      {/* Center: tabs */}
      <div className="mx-auto flex items-center gap-0.5 rounded-lg bg-ink-900 p-0.5">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => onTab(t)}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              tab === t ? "bg-ink-800 text-neutral-100 shadow-soft" : "text-neutral-500 hover:text-neutral-300",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        <button className="hidden items-center gap-1.5 rounded-lg border border-ink-700 px-2.5 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-white/[0.05] sm:inline-flex">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><path d="m8 12 4 4 4-4" /><path d="M12 2v14" />
          </svg>
          Download ZIP
        </button>
        <button className="hidden items-center gap-1.5 rounded-lg border border-ink-700 px-2.5 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-white/[0.05] sm:inline-flex">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
          </svg>
          Share
        </button>
        <button
          onClick={onRun}
          disabled={runState !== "idle"}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-all",
            runState === "running"
              ? "bg-emerald-600/90"
              : "bg-emerald-600 hover:bg-emerald-500 hover:-translate-y-0.5 disabled:translate-y-0",
          )}
        >
          {runState === "idle" && (
            <>
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" stroke="none">
                <path d="M6 4v16l14-8z" />
              </svg>
              Run
            </>
          )}
          {runState === "starting" && (
            <>
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 animate-spin" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 3a9 9 0 1 0 9 9" />
              </svg>
              Starting…
            </>
          )}
          {runState === "running" && (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              Running
            </>
          )}
        </button>
      </div>
    </header>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/marketing/Logo";
import { ArrowLeft, Download, Play, Telegram, Discord } from "@/components/icons";
import type { Project } from "@/lib/workspace/types";
import { cn } from "@/lib/utils";

export type SaveStatus = "saved" | "saving";

function PlatformBadge({ platform }: { platform: Project["platform"] }) {
  const telegram = platform === "telegram";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px]",
        telegram ? "text-[#2aabee]" : "text-[#5865f2]",
        "bg-white/[0.04]",
      )}
    >
      {telegram ? <Telegram className="h-3 w-3" /> : <Discord className="h-3 w-3" />}
      {telegram ? "Telegram" : "Discord"}
    </span>
  );
}

export function TopBar({
  project,
  status,
  onRename,
  onDownload,
  onRun,
}: {
  project: Project;
  status: SaveStatus;
  onRename: (name: string) => void;
  onDownload: () => void;
  onRun: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.name);
  const langLabel = project.language === "python" ? "Python" : "Node.js";

  function commit() {
    onRename(draft);
    setEditing(false);
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-ink-800 bg-ink-950 px-3">
      <Link
        href="/dashboard"
        className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-neutral-400 transition-colors hover:bg-white/[0.05] hover:text-neutral-200"
        title="Back to dashboard"
      >
        <ArrowLeft className="h-4 w-4" />
        <Logo className="h-5 w-5" />
      </Link>

      <div className="flex min-w-0 items-center gap-2">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(project.name);
                setEditing(false);
              }
            }}
            className="w-48 rounded border border-accent/50 bg-ink-900 px-2 py-0.5 text-sm text-neutral-100 outline-none"
          />
        ) : (
          <button
            onClick={() => {
              setDraft(project.name);
              setEditing(true);
            }}
            className="truncate rounded px-1 text-sm font-medium text-neutral-100 hover:bg-white/[0.05]"
            title="Rename project"
          >
            {project.name}
          </button>
        )}
        <div className="hidden items-center gap-2 sm:flex">
          <PlatformBadge platform={project.platform} />
          <span className="rounded-md bg-white/[0.04] px-2 py-0.5 text-[11px] text-neutral-400">{langLabel}</span>
        </div>
      </div>

      <span className="ml-auto hidden items-center gap-1.5 text-[11px] text-neutral-500 sm:flex">
        <span className={cn("h-1.5 w-1.5 rounded-full", status === "saving" ? "bg-amber-400" : "bg-emerald-500")} />
        {status === "saving" ? "Saving…" : "All changes saved"}
      </span>

      <div className="flex items-center gap-2">
        <button
          onClick={onDownload}
          className="inline-flex items-center gap-1.5 rounded-lg border border-ink-700 px-2.5 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-white/[0.05]"
        >
          <Download className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Download ZIP</span>
        </button>
        <button
          onClick={onRun}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500"
        >
          <Play className="h-3.5 w-3.5" />
          Run locally
        </button>
      </div>
    </header>
  );
}

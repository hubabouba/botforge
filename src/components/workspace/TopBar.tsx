"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/marketing/Logo";
import { ArrowLeft, Download, Play, Telegram, Discord, Bot } from "@/components/icons";
import type { Project } from "@/lib/workspace/types";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { cn } from "@/lib/utils";

export type SaveStatus = "saved" | "saving" | "error";

function PlatformBadge({ platform }: { platform: Project["platform"] }) {
  const telegram = platform === "telegram";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md bg-white/[0.05] px-2 py-0.5 text-[11px]",
        telegram ? "text-[#2aabee]" : "text-[#7d88ff]",
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
  chatOpen,
  onToggleChat,
  onRename,
  onDownload,
  onRun,
}: {
  project: Project;
  status: SaveStatus;
  chatOpen: boolean;
  onToggleChat: () => void;
  onRename: (name: string) => void;
  onDownload: () => void;
  onRun: () => void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.name);
  // Unmounting the input on Escape can still fire its onBlur → commit; the ref
  // makes the cancellation win regardless of event order.
  const cancelled = useRef(false);
  const langLabel = project.language === "python" ? "Python" : "Node.js";

  function commit() {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    onRename(draft);
    setEditing(false);
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-white/[0.06] bg-[#0B0D13]/70 px-3 backdrop-blur-xl">
      <Link
        href="/dashboard"
        className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white"
        title={t("top.backToDashboard")}
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
                cancelled.current = true;
                setDraft(project.name);
                setEditing(false);
              }
            }}
            className="w-48 rounded border border-[#6366F1]/50 bg-white/[0.04] px-2 py-0.5 text-sm text-white outline-none"
          />
        ) : (
          <button
            onClick={() => {
              setDraft(project.name);
              setEditing(true);
            }}
            className="truncate rounded px-1 text-sm font-medium text-white transition-colors hover:bg-white/[0.06]"
            title={t("top.renameProject")}
          >
            {project.name}
          </button>
        )}
        <div className="hidden items-center gap-2 sm:flex">
          <PlatformBadge platform={project.platform} />
          <span className="rounded-md bg-white/[0.05] px-2 py-0.5 text-[11px] text-white/55">{langLabel}</span>
        </div>
      </div>

      <span className="ml-auto hidden items-center gap-1.5 text-[11px] text-white/50 sm:flex">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            status === "saving" ? "animate-pulse bg-amber-400" : status === "error" ? "bg-rose-400" : "bg-emerald-400",
          )}
        />
        {status === "saving" ? t("top.saving") : status === "error" ? t("top.saveFailed") : t("top.allSaved")}
      </span>

      <div className="flex items-center gap-2">
        <button
          onClick={onToggleChat}
          title={chatOpen ? t("top.hideAssistant") : t("top.showAssistant")}
          className={cn(
            "hidden items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-all lg:inline-flex",
            chatOpen
              ? "border-[#6366F1]/40 bg-gradient-to-r from-[#6366F1]/20 to-[#22D3EE]/10 text-[#a5b4fc]"
              : "border-white/10 text-white/70 hover:bg-white/[0.06] hover:text-white",
          )}
        >
          <Bot className="h-3.5 w-3.5" />
          {t("top.assistant")}
        </button>
        <button
          onClick={onDownload}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          <Download className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t("top.downloadZip")}</span>
        </button>
        <button
          onClick={onRun}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-1.5 text-xs font-medium text-white shadow-[0_8px_24px_-8px_rgba(16,185,129,0.75)] transition-transform hover:-translate-y-px"
        >
          <Play className="h-3.5 w-3.5" />
          {t("top.run")}
        </button>
      </div>
    </header>
  );
}

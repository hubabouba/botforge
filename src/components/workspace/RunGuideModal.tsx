"use client";

import { useEffect, useState } from "react";
import type { Project } from "@/lib/workspace/types";
import { Close, Copy, Check, Terminal } from "@/components/icons";
import { useI18n } from "@/lib/i18n/I18nProvider";

/** Honest "how to run" panel — real local commands, no fake in-browser runtime. */
export function RunGuideModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const { t } = useI18n();
  const isPython = project.language === "python";
  const steps = isPython
    ? ["pip install -r requirements.txt", "cp .env.example .env", `python ${project.entry}`]
    : ["npm install", "cp .env.example .env", "npm start"];

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-ink-800 bg-ink-950 shadow-lift"
      >
        <div className="flex items-center gap-2 border-b border-ink-800 px-5 py-3.5">
          <Terminal className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-medium text-neutral-100">{t("run.title")}</h2>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-neutral-500 hover:bg-white/[0.06] hover:text-neutral-200"
          >
            <Close className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          <p className="text-sm text-neutral-400">{t("run.downloadHint").replace("{n}", String(steps.length))}</p>
          <ol className="mt-4 space-y-2">
            {steps.map((cmd, i) => (
              <Step key={cmd} index={i + 1} cmd={cmd} />
            ))}
          </ol>
          <p className="mt-4 rounded-lg border border-ink-800 bg-ink-900/60 px-3 py-2 text-xs text-neutral-500">
            {t("run.tokenHintPre")}{" "}
            {isPython || project.platform === "telegram" ? t("run.botFather") : t("run.discordPortal")}{" "}
            {t("run.tokenHintMid")} <span className="font-mono text-neutral-400">.env</span>. {t("run.oneClickComingLater")}
          </p>
        </div>
      </div>
    </div>
  );
}

function Step({ index, cmd }: { index: number; cmd: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard?.writeText(cmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  }
  return (
    <li className="flex items-center gap-3 rounded-lg border border-ink-800 bg-ink-900 px-3 py-2">
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/[0.06] text-[11px] text-neutral-400">
        {index}
      </span>
      <code className="flex-1 font-mono text-[13px] text-neutral-200">{cmd}</code>
      <button
        onClick={copy}
        aria-label={t("run.copyCommand")}
        className="grid h-6 w-6 shrink-0 place-items-center rounded text-neutral-500 hover:bg-white/10 hover:text-neutral-200"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </li>
  );
}

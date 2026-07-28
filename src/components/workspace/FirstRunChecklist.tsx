"use client";

import { useEffect, useState } from "react";
import type { Project } from "@/lib/workspace/types";
import { Check, ChevronRight, Close } from "@/components/icons";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { cn } from "@/lib/utils";

/**
 * The path from "a project exists" to "my bot answered me", shown as a
 * checklist that tracks real state rather than a static tips card.
 *
 * A newcomer arrives in the workspace with generated code and no idea what to
 * do with it. The step that actually stops people isn't the code — it's getting
 * a bot token, because nothing on screen explains what BotFather is. So that
 * step carries the instructions inline instead of linking away.
 *
 * Hides itself once every step is done, and stays hidden after that.
 */

const DISMISS_KEY = "bf:firstrun";

export function FirstRunChecklist({
  project,
  hasChatted,
  hasToken,
  hasRun,
  onOpenRun,
}: {
  project: Project;
  /** Sent at least one message to the assistant. */
  hasChatted: boolean;
  /** A bot token is stored for this project. */
  hasToken: boolean;
  /** The bot has been started at least once. */
  hasRun: boolean;
  onOpenRun: () => void;
}) {
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(true); // hidden until we've read storage
  const [open, setOpen] = useState<number | null>(null);
  const telegram = project.platform === "telegram";

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false); // storage blocked — showing it is the safer default
    }
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* non-fatal */
    }
  }

  const steps = [
    { key: "describe", done: hasChatted, body: null },
    {
      key: "token",
      done: hasToken,
      // The one step people get stuck on, so it explains itself in place.
      body: (
        <div className="mt-2">
          <ol className="space-y-1.5 text-xs leading-relaxed text-neutral-400">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="flex gap-2">
                <span className="text-neutral-600">{i + 1}.</span>
                <span>{t(`firstrun.token.${telegram ? "tg" : "dc"}.${i}`)}</span>
              </li>
            ))}
          </ol>

          {/* A door and a manual. The first link opens the exact place step one
              describes — for someone who has never heard of BotFather, "go find
              @BotFather" and a button that opens it are not the same thing. The
              second is the platform's own documentation: it can't rot the way a
              third-party video can, and it's the authority if our four lines
              ever fall behind a UI change. */}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <a
              href={telegram ? "https://t.me/BotFather" : "https://discord.com/developers/applications"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-ink-700 px-2 py-0.5 text-[11px] text-neutral-300 transition-colors hover:border-accent/50 hover:text-white"
            >
              {t(telegram ? "firstrun.token.openTg" : "firstrun.token.openDc")}
            </a>
            <a
              href={
                telegram
                  ? "https://core.telegram.org/bots/features#botfather"
                  : "https://discord.com/developers/docs/quick-start/getting-started"
              }
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-neutral-500 underline decoration-neutral-700 underline-offset-2 transition-colors hover:text-neutral-300"
            >
              {t("firstrun.token.docs")}
            </a>
          </div>

          {/* The fallback is our own assistant, not "go ask another AI". It is
              two panels away, it can see this project, and sending people to a
              competitor at the moment they're stuck says we don't back our own. */}
          <p className="mt-2 text-[11px] leading-relaxed text-neutral-500">{t("firstrun.token.stuck")}</p>
        </div>
      ),
    },
    { key: "run", done: hasRun, body: null },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  // Nothing left to guide, or the user said they're fine.
  if (dismissed || doneCount === steps.length) return null;

  return (
    <div className="shrink-0 border-b border-ink-800 bg-ink-900/40 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
          {t("firstrun.title")}
        </span>
        <span className="text-[11px] text-neutral-600">
          {doneCount}/{steps.length}
        </span>
        <button
          onClick={dismiss}
          aria-label={t("firstrun.dismiss")}
          title={t("firstrun.dismiss")}
          className="ml-auto grid h-5 w-5 place-items-center rounded text-neutral-600 transition-colors hover:bg-white/[0.06] hover:text-neutral-300"
        >
          <Close className="h-3.5 w-3.5" />
        </button>
      </div>

      <ul className="mt-1.5 space-y-0.5">
        {steps.map((step, i) => {
          const expanded = open === i;
          const expandable = !!step.body && !step.done;
          return (
            <li key={step.key}>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border",
                    step.done
                      ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300"
                      : "border-ink-700 text-transparent",
                  )}
                >
                  <Check className="h-2.5 w-2.5" />
                </span>
                <button
                  onClick={() => expandable && setOpen(expanded ? null : i)}
                  disabled={!expandable}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-1 text-left text-xs transition-colors",
                    step.done ? "text-neutral-600 line-through" : "text-neutral-300",
                    expandable && "hover:text-white",
                  )}
                >
                  <span className="truncate">{t(`firstrun.${step.key}`)}</span>
                  {expandable && (
                    <ChevronRight
                      className={cn("h-3 w-3 shrink-0 text-neutral-600 transition-transform", expanded && "rotate-90")}
                    />
                  )}
                </button>
                {step.key === "run" && !step.done && (
                  <button
                    onClick={onOpenRun}
                    className="shrink-0 rounded-md border border-ink-700 px-2 py-0.5 text-[11px] text-neutral-400 transition-colors hover:text-neutral-100"
                  >
                    {t("firstrun.howTo")}
                  </button>
                )}
              </div>
              {expanded && step.body && <div className="ml-5.5 pl-0.5">{step.body}</div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

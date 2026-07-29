"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { track } from "@/lib/analytics";
import { Close } from "@/components/icons";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { cn } from "@/lib/utils";

/**
 * Two-question survey shown to free users right before the create-project
 * wizard, after they dismiss the pricing modal. Deliberately skippable from
 * every exit (Skip, ✕, Escape, backdrop): this collects signal, it must never
 * stand between someone and the product. Answers go to PostHog only — nothing
 * is stored against the account.
 */

// Stable, language-independent option ids — the labels are translated, the
// values that reach analytics are not, so the funnel stays comparable across
// locales.
const HEARD_FROM = ["ads", "friend", "search", "social", "other"] as const;
const BOT_TYPE = ["shop", "community", "support", "automation", "content", "other"] as const;

export function ProjectSurveyModal({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [heardFrom, setHeardFrom] = useState<string>("");
  const [botType, setBotType] = useState<string>("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    track("precreate_survey_shown");
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onDone();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onDone]);

  function submit() {
    // Only report an actual answer — an empty submit is indistinguishable from
    // a skip and would just add noise to the funnel.
    if (heardFrom || botType) {
      track("precreate_survey_submitted", {
        heardFrom: heardFrom || undefined,
        botType: botType || undefined,
      });
    }
    onDone();
  }

  const content = (
    <div
      className="forge dark fixed inset-0 z-[60] modal-backdrop grid place-items-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
      onClick={onDone}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-panel flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-lift"
      >
        <div className="flex items-start gap-3 border-b border-border px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{t("survey.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("survey.subtitle")}</p>
          </div>
          <button
            onClick={onDone}
            aria-label={t("common.close")}
            className="ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Close className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto p-5">
          <Question
            label={t("survey.q1")}
            options={HEARD_FROM.map((id) => ({ id, label: t(`survey.heard.${id}`) }))}
            value={heardFrom}
            onPick={setHeardFrom}
          />
          <Question
            label={t("survey.q2")}
            options={BOT_TYPE.map((id) => ({ id, label: t(`survey.bot.${id}`) }))}
            value={botType}
            onPick={setBotType}
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            onClick={onDone}
            className="rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("survey.skip")}
          </button>
          <button
            onClick={submit}
            className="rounded-lg bg-accent px-4 py-2 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
          >
            {t("survey.continue")}
          </button>
        </div>
      </div>
    </div>
  );

  return mounted ? createPortal(content, document.body) : null;
}

function Question({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: { id: string; label: string }[];
  value: string;
  onPick: (id: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-medium">{label}</p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.id}
            // Tapping the selected chip again clears it — the question stays
            // optional even after an accidental tap.
            onClick={() => onPick(value === o.id ? "" : o.id)}
            aria-pressed={value === o.id}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs transition-colors",
              value === o.id
                ? "border-accent bg-accent-soft text-accent"
                : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "next-themes";
import { loadPrefs, savePrefs, DEFAULT_PREFERENCES, type AssistantPreferences } from "@/lib/workspace/assistantPrefs";
import { planMeta, type Plan } from "@/lib/plan";
import { Close } from "@/components/icons";
import { cn } from "@/lib/utils";

const LANGUAGES = ["", "English", "Русский", "Español", "Deutsch", "Français"];
const LANG_LABEL: Record<string, string> = { "": "Match me" };
const STYLES: { value: NonNullable<AssistantPreferences["style"]>; label: string }[] = [
  { value: "concise", label: "Concise" },
  { value: "balanced", label: "Balanced" },
  { value: "detailed", label: "Detailed" },
];
const THEMES = ["light", "dark", "system"] as const;

export function SettingsModal({
  name,
  email,
  plan,
  onOpenUpgrade,
  onClose,
}: {
  name: string;
  email: string;
  plan: Plan;
  onOpenUpgrade: () => void;
  onClose: () => void;
}) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [prefs, setPrefs] = useState<AssistantPreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    setMounted(true);
    setPrefs(loadPrefs());
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  function update(patch: Partial<AssistantPreferences>) {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      savePrefs(next);
      return next;
    });
  }

  const initials = (name || email).slice(0, 2).toUpperCase();

  const content = (
    <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-lift"
      >
        <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold">Settings</h2>
          <button
            onClick={onClose}
            className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Close className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto p-5">
          {/* Account */}
          <section>
            <SectionTitle>Account</SectionTitle>
            <div className="flex items-center gap-3 rounded-xl border border-border p-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                {initials}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{name}</div>
                <div className="truncate text-xs text-muted-foreground">{email}</div>
              </div>
            </div>
          </section>

          {/* Appearance */}
          <section>
            <SectionTitle>Appearance</SectionTitle>
            <div className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5">
              {THEMES.map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                    mounted && theme === t
                      ? "bg-background text-foreground shadow-soft"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </section>

          {/* Assistant persona */}
          <section>
            <SectionTitle>Assistant persona</SectionTitle>
            <p className="mb-2.5 text-xs text-muted-foreground">How the in-editor assistant talks to you, across all projects.</p>

            <label className="mb-1 block text-xs text-muted-foreground">Reply language</label>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {LANGUAGES.map((lang) => (
                <Chip key={lang || "auto"} active={(prefs.language ?? "") === lang} onClick={() => update({ language: lang })}>
                  {LANG_LABEL[lang] ?? lang}
                </Chip>
              ))}
            </div>

            <label className="mb-1 block text-xs text-muted-foreground">Style</label>
            <div className="mb-3 flex gap-1.5">
              {STYLES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => update({ style: s.value })}
                  className={cn(
                    "flex-1 rounded-lg border px-2 py-1.5 text-xs transition-colors",
                    prefs.style === s.value
                      ? "border-accent bg-accent-soft/60 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <label className="mb-1 block text-xs text-muted-foreground">Character</label>
            <input
              value={prefs.persona ?? ""}
              onChange={(e) => update({ persona: e.target.value })}
              maxLength={400}
              placeholder="e.g. a friendly mentor · a blunt senior engineer"
              className="mb-3 w-full rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-xs outline-none focus:border-accent"
            />

            <label className="mb-1 block text-xs text-muted-foreground">Custom instructions</label>
            <textarea
              value={prefs.custom ?? ""}
              onChange={(e) => update({ custom: e.target.value })}
              maxLength={1000}
              rows={2}
              placeholder="Anything else the assistant should always do…"
              className="w-full resize-none rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-xs outline-none focus:border-accent"
            />
          </section>

          {/* Billing */}
          <section>
            <SectionTitle>Billing</SectionTitle>
            <div className="flex items-center justify-between rounded-xl border border-border p-3">
              <div>
                <div className="text-sm font-medium">{planMeta(plan).name} plan</div>
                <div className="text-xs text-muted-foreground">{planMeta(plan).tagline}</div>
              </div>
              <button
                onClick={onOpenUpgrade}
                className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
              >
                {plan === "pro" ? "Manage" : "Upgrade"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );

  return mounted ? createPortal(content, document.body) : null;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</h3>;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs transition-colors",
        active ? "border-accent bg-accent-soft/60 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

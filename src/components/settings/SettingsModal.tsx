"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "next-themes";
import { loadPrefs, savePrefs, DEFAULT_PREFERENCES, type AssistantPreferences } from "@/lib/workspace/assistantPrefs";
import { planMeta, type Plan } from "@/lib/plan";
import { Close } from "@/components/icons";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { LOCALES } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

const LANGUAGES = ["", "English", "Русский", "Español", "Deutsch", "Français"];
const STYLES: { value: NonNullable<AssistantPreferences["style"]>; labelKey: string }[] = [
  { value: "concise", labelKey: "settings.styleConcise" },
  { value: "balanced", labelKey: "settings.styleBalanced" },
  { value: "detailed", labelKey: "settings.styleDetailed" },
];
const THEMES = ["light", "dark", "system"] as const;
const THEME_LABEL_KEY: Record<(typeof THEMES)[number], string> = {
  light: "settings.themeLight",
  dark: "settings.themeDark",
  system: "settings.themeSystem",
};

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
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [prefs, setPrefs] = useState<AssistantPreferences>(DEFAULT_PREFERENCES);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dangerErr, setDangerErr] = useState("");

  async function deleteAccount() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    setDangerErr("");
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || t("settings.deleteAccountError"));
      }
      // Account and session are gone — leave the app.
      window.location.href = "/";
    } catch (e) {
      setDangerErr((e as Error).message);
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  useEffect(() => {
    setMounted(true);
    setPrefs(loadPrefs());
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  function update(patch: Partial<AssistantPreferences>) {
    // Side effect stays outside the updater — StrictMode re-runs updaters.
    const next = { ...prefs, ...patch };
    savePrefs(next);
    setPrefs(next);
  }

  const initials = (name || email).slice(0, 2).toUpperCase();

  const content = (
    <div className="forge dark fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-lift"
      >
        <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold">{t("settings.title")}</h2>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Close className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto p-5">
          {/* Account */}
          <section>
            <SectionTitle>{t("settings.account")}</SectionTitle>
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
            <SectionTitle>{t("settings.appearance")}</SectionTitle>
            <div className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5">
              {THEMES.map((th) => (
                <button
                  key={th}
                  onClick={() => setTheme(th)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    mounted && theme === th
                      ? "bg-background text-foreground shadow-soft"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(THEME_LABEL_KEY[th])}
                </button>
              ))}
            </div>

            {/* Interface language — the switcher only lived on the landing page
                before, leaving a signed-in user stuck with the auto-detected
                locale. Same LOCALES/setLang mechanism, modal-native look. */}
            <label className="mb-1 mt-3 block text-xs text-muted-foreground">{t("settings.language")}</label>
            <div className="flex flex-wrap gap-1.5">
              {LOCALES.map((l) => (
                <Chip key={l.code} active={lang === l.code} onClick={() => setLang(l.code)}>
                  {l.flag} {l.label}
                </Chip>
              ))}
            </div>
          </section>

          {/* Assistant persona */}
          <section>
            <SectionTitle>{t("settings.assistantPersona")}</SectionTitle>
            <p className="mb-2.5 text-xs text-muted-foreground">{t("settings.assistantPersonaHint")}</p>

            <label className="mb-1 block text-xs text-muted-foreground">{t("settings.replyLanguage")}</label>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {LANGUAGES.map((lang) => (
                <Chip key={lang || "auto"} active={(prefs.language ?? "") === lang} onClick={() => update({ language: lang })}>
                  {lang || t("settings.matchMe")}
                </Chip>
              ))}
            </div>

            <label className="mb-1 block text-xs text-muted-foreground">{t("settings.style")}</label>
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
                  {t(s.labelKey)}
                </button>
              ))}
            </div>

            <label className="mb-1 block text-xs text-muted-foreground">{t("settings.character")}</label>
            <input
              value={prefs.persona ?? ""}
              onChange={(e) => update({ persona: e.target.value })}
              maxLength={400}
              placeholder={t("settings.characterPlaceholder")}
              className="mb-3 w-full rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-xs outline-none focus:border-accent"
            />

            <label className="mb-1 block text-xs text-muted-foreground">{t("settings.customInstructions")}</label>
            <textarea
              value={prefs.custom ?? ""}
              onChange={(e) => update({ custom: e.target.value })}
              maxLength={1000}
              rows={2}
              placeholder={t("settings.customInstructionsPlaceholder")}
              className="w-full resize-none rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-xs outline-none focus:border-accent"
            />
          </section>

          {/* Billing */}
          <section>
            <SectionTitle>{t("settings.billing")}</SectionTitle>
            <div className="flex items-center justify-between rounded-xl border border-border p-3">
              <div>
                <div className="text-sm font-medium">{planMeta(plan).name} {t("settings.plan")}</div>
                <div className="text-xs text-muted-foreground">{t(`plan.${plan}.tagline`)}</div>
              </div>
              <button
                onClick={onOpenUpgrade}
                className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
              >
                {plan === "pro" ? t("settings.manage") : t("settings.upgrade")}
              </button>
            </div>
          </section>

          {/* Data & privacy */}
          <section>
            <SectionTitle>{t("settings.dataPrivacy")}</SectionTitle>
            <div className="space-y-2.5 rounded-xl border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{t("settings.exportData")}</div>
                  <div className="text-xs text-muted-foreground">{t("settings.exportDataHint")}</div>
                </div>
                <a
                  href="/api/account/export"
                  className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
                >
                  {t("settings.export")}
                </a>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-border pt-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-red-500">{t("settings.deleteAccount")}</div>
                  <div className="text-xs text-muted-foreground">{t("settings.deleteAccountHint")}</div>
                </div>
                <button
                  onClick={deleteAccount}
                  disabled={deleting}
                  className="shrink-0 rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                >
                  {deleting ? t("settings.deleting") : confirmDelete ? t("settings.reallyDeleteAccount") : t("settings.delete")}
                </button>
              </div>
              {dangerErr && <p className="text-xs text-red-500">{dangerErr}</p>}
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

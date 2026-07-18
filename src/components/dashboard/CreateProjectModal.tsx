"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BOT_TYPES,
  AUDIENCES,
  PERSONALITY_PRESETS,
  scaffoldProject,
  type BotType,
  type Audience,
  type BotTypeMeta,
} from "@/lib/workspace/scaffold";
import { createProject } from "@/lib/workspace/store";
import { track } from "@/lib/analytics";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { Language, Platform } from "@/lib/workspace/types";
import { Close, ArrowLeft, ArrowRight, Chat, Bell, Shield, ShoppingBag, Wrench, Bot, Telegram, Discord } from "@/components/icons";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<BotTypeMeta["icon"], (p: { className?: string }) => React.ReactElement> = {
  assistant: Chat,
  bell: Bell,
  shield: Shield,
  bag: ShoppingBag,
  wrench: Wrench,
  bot: Bot,
};

function Seg<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          disabled={o.disabled}
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40",
            value === o.id ? "bg-background text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function CreateProjectModal({ onClose, onLimit }: { onClose: () => void; onLimit?: () => void }) {
  const router = useRouter();
  const { t } = useI18n();
  const [step, setStep] = useState<1 | 2>(1);
  const [type, setType] = useState<BotType>("assistant");
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState<Platform>("telegram");
  const [language, setLanguage] = useState<Language>("python");
  const [audience, setAudience] = useState<Audience>("personal");
  const [purpose, setPurpose] = useState("");
  const [personality, setPersonality] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  function pickType(meta: BotTypeMeta) {
    setType(meta.id);
    setPlatform(meta.platform);
    setLanguage(meta.language);
    if (!name.trim()) setName(meta.id === "blank" ? "my-bot" : `${meta.id}-bot`);
    setStep(2);
  }

  function setPlatformSafe(p: Platform) {
    setPlatform(p);
    if (p === "discord") setLanguage("node"); // only discord.js starter
  }

  async function create() {
    if (busy) return;
    setBusy(true);
    setError("");
    const result = await createProject(
      scaffoldProject({ name, platform, language, type, audience, purpose, personality }),
    );
    if (result.ok) {
      track("project_created", { source: "wizard", platform, language });
      router.push(`/workspace/${result.project.id}`);
      return; // keep busy — we're navigating away
    }
    setBusy(false);
    if (result.error === "limit") {
      onLimit?.();
      onClose();
    } else {
      setError(t("create.errorGeneric"));
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-lift"
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold">{t("create.title")}</h2>
          <span className="text-xs text-muted-foreground">
            {t("create.step")} {step} {t("create.of")} 2
          </span>
          <div className="ml-2 flex gap-1">
            <span className={cn("h-1 w-6 rounded-full", step >= 1 ? "bg-accent" : "bg-border")} />
            <span className={cn("h-1 w-6 rounded-full", step >= 2 ? "bg-accent" : "bg-border")} />
          </div>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Close className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          {step === 1 ? (
            <>
              <p className="text-sm text-muted-foreground">{t("create.whatKind")}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {BOT_TYPES.map((meta) => {
                  const Icon = TYPE_ICON[meta.icon];
                  const selected = type === meta.id;
                  return (
                    <button
                      key={meta.id}
                      onClick={() => pickType(meta)}
                      className={cn(
                        "group flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors",
                        selected ? "border-accent bg-accent-soft/50" : "border-border hover:border-accent/40 hover:bg-muted/50",
                      )}
                    >
                      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{meta.label}</span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{meta.blurb}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="space-y-5">
              <div>
                <label className="text-sm font-medium">{t("create.projectName")}</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="my-bot"
                  className="mt-2 w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/25"
                />
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
                <div>
                  <div className="mb-2 text-sm font-medium">{t("create.platform")}</div>
                  <Seg
                    options={[
                      { id: "telegram", label: "Telegram" },
                      { id: "discord", label: "Discord" },
                    ]}
                    value={platform}
                    onChange={(v) => setPlatformSafe(v as Platform)}
                  />
                </div>
                <div>
                  <div className="mb-2 text-sm font-medium">{t("create.language")}</div>
                  <Seg
                    options={[
                      { id: "python", label: "Python", disabled: platform === "discord" },
                      { id: "node", label: "Node.js" },
                    ]}
                    value={language}
                    onChange={(v) => setLanguage(v as Language)}
                  />
                  {platform === "discord" && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">{t("create.discordHint")}</p>
                  )}
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm font-medium">{t("create.whoFor")}</div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {AUDIENCES.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setAudience(a.id)}
                      className={cn(
                        "rounded-xl border p-3 text-left transition-colors",
                        audience === a.id ? "border-accent bg-accent-soft/50" : "border-border hover:border-accent/40",
                      )}
                    >
                      <div className="text-sm font-medium">{a.label}</div>
                      <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{a.note}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">
                  {t("create.whatShouldItDo")} <span className="font-normal text-muted-foreground">{t("create.optional")}</span>
                </label>
                <textarea
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  rows={2}
                  placeholder={t("create.purposePlaceholder")}
                  className="mt-2 w-full resize-none rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/25"
                />
                <p className="mt-1.5 text-[11px] text-muted-foreground">{t("create.purposeHint")}</p>
              </div>

              <div>
                <label className="text-sm font-medium">
                  {t("create.personality")} <span className="font-normal text-muted-foreground">{t("create.optional")}</span>
                </label>
                <input
                  value={personality}
                  onChange={(e) => setPersonality(e.target.value)}
                  placeholder={t("create.personalityPlaceholder")}
                  className="mt-2 w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/25"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {PERSONALITY_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPersonality(p)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition-colors",
                        personality === p
                          ? "border-accent bg-accent-soft/60 text-foreground"
                          : "border-border text-muted-foreground hover:border-accent/40 hover:text-foreground",
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {t("create.personalityHintPre")} <code className="font-mono">PERSONA</code> {t("create.personalityHintPost")}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3.5">
          {step === 2 ? (
            <button
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> {t("create.back")}
            </button>
          ) : (
            <PlatformHint />
          )}
          {step === 1 ? (
            <button
              onClick={() => setStep(2)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
            >
              {t("create.next")} <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex items-center gap-3">
              {error && <span className="text-xs text-rose-500">{error}</span>}
              <button
                onClick={create}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {busy ? t("create.creating") : t("create.createProject")} <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PlatformHint() {
  const { t } = useI18n();
  return (
    <span className="flex items-center gap-2 text-xs text-muted-foreground">
      <Telegram className="h-3.5 w-3.5" />
      <Discord className="h-3.5 w-3.5" />
      {t("create.platformHint")}
    </span>
  );
}

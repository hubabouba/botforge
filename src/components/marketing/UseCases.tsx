"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";

function Icon({ path }: { path: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      {path}
    </svg>
  );
}

// Tags are short bot commands / proper nouns — kept as-is across languages.
const meta: { tag: string; icon: ReactNode }[] = [
  { tag: "/price BTC", icon: <Icon path={<><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></>} /> },
  { tag: "auto-mod", icon: <Icon path={<><path d="M12 3 4 6v6c0 5 3.5 7.5 8 9 4.5-1.5 8-4 8-9V6Z" /><path d="m9 12 2 2 4-4" /></>} /> },
  { tag: "/quiz", icon: <Icon path={<><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.9.4-1 1-1 1.7" /><path d="M12 17h.01" /></>} /> },
  { tag: "/remind", icon: <Icon path={<><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2" /><path d="M5 3 2 6" /><path d="m19 3 3 3" /></>} /> },
  { tag: "AI reply", icon: <Icon path={<><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" /></>} /> },
  { tag: "RSS → channel", icon: <Icon path={<><path d="M4 11a9 9 0 0 1 9 9" /><path d="M4 4a16 16 0 0 1 16 16" /><circle cx="5" cy="19" r="1" /></>} /> },
];

export function UseCases() {
  const { t } = useI18n();
  const cases = meta.map((m, i) => ({
    tag: m.tag,
    icon: m.icon,
    title: t(`useCases.c${i}.t`),
    body: t(`useCases.c${i}.d`),
  }));

  return (
    <section className="py-24">
      <div className="container-x">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-accent">{t("useCases.kicker")}</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            {t("useCases.title")}
          </h2>
          <p className="mt-4 text-muted-foreground">
            {t("useCases.subtitle")}
          </p>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cases.map((c) => (
            <div
              key={c.title}
              className="group rounded-2xl border border-border bg-background p-6 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  {c.icon}
                </span>
                <span className="rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
                  {c.tag}
                </span>
              </div>
              <h3 className="mt-4 font-medium">{c.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
